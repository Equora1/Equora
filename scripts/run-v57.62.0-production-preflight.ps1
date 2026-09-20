[CmdletBinding()]
param(
  [ValidateSet('ValidateLocal', 'ExecuteReadOnly')]
  [string]$Mode = 'ValidateLocal',

  [string]$ExpectedHead,

  [string]$ExpectedProjectRef,

  [string]$ExpectedDatabaseHost,

  [string]$EvidenceDirectory,

  [string]$PsqlExecutablePath,

  [string]$ExpectedPsqlSha256,

  [string]$ExpectedPsqlBundleSha256,

  [string]$ExpectedSslRootCertificateSha256,

  [ValidateRange(1, 120)]
  [int]$PsqlTimeoutSeconds = 75
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$script:ManifestPath = Join-Path $script:RepositoryRoot `
  'docs\gates\EQUORA_v57.62.0_PRODUCTION_SQL_MANIFEST.json'
$script:PreflightRelativePath = 'supabase/preflight-v57.62.0-trade-import.sql'
$script:RequiredProjectRef = 'rrkfdprhqilvicjbgfcn'
$script:RequiredSourceCommit = '889a145e3443e52e5298ae945f53e3a8f44dc50b'
$script:RequiredSourceTree = '0868907cd1fb05abdd9072541f6b24f05bff3196'
$script:RequiredManifestAlgorithm = (
  'SHA-256 over file bytes after replacing CRLF with LF; ' +
  'lone CR and all other bytes are preserved'
)
$script:RequiredSqlPaths = @(
  'supabase/preflight-v57.62.0-trade-import.sql',
  'supabase/deploy-v57.62.0-trade-import.sql',
  'supabase/postflight-v57.62.0-trade-import.sql',
  'supabase/schema-patch-v57.62.0-trade-import-hardening.sql',
  'supabase/verify-v57.62.0-trade-import.sql',
  'supabase/activate-v57.62.0-trade-import.sql',
  'supabase/deactivate-v57.62.0-trade-import.sql'
)

function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($sha256.ComputeHash($Bytes)).Replace('-', '')
  }
  finally {
    $sha256.Dispose()
  }
}

function Get-Sha256HexFromStream {
  param([Parameter(Mandatory = $true)][IO.Stream]$Stream)

  if (-not $Stream.CanSeek -or -not $Stream.CanRead) {
    throw 'SHA-256 input stream must be readable and seekable.'
  }
  $originalPosition = $Stream.Position
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $Stream.Position = 0
    return [BitConverter]::ToString($sha256.ComputeHash($Stream)).Replace('-', '')
  }
  finally {
    $Stream.Position = $originalPosition
    $sha256.Dispose()
  }
}

function ConvertTo-NativeProcessArgument {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Argument)

  if ($Argument.Length -eq 0) {
    return '""'
  }
  if ($Argument -notmatch '[\s"]') {
    return $Argument
  }

  $result = [Text.StringBuilder]::new()
  [void]$result.Append('"')
  $backslashCount = 0
  foreach ($character in $Argument.ToCharArray()) {
    if ($character -eq '\') {
      $backslashCount += 1
      continue
    }
    if ($character -eq '"') {
      [void]$result.Append(('\' * (($backslashCount * 2) + 1)))
      [void]$result.Append('"')
      $backslashCount = 0
      continue
    }
    if ($backslashCount -gt 0) {
      [void]$result.Append(('\' * $backslashCount))
      $backslashCount = 0
    }
    [void]$result.Append($character)
  }
  if ($backslashCount -gt 0) {
    [void]$result.Append(('\' * ($backslashCount * 2)))
  }
  [void]$result.Append('"')
  return $result.ToString()
}

function ConvertFrom-NativeProcessText {
  param([AllowEmptyString()][string]$Text)

  if ([string]::IsNullOrEmpty($Text)) {
    return @()
  }
  $lines = @($Text -split "\r?\n")
  if ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -eq '') {
    if ($lines.Count -eq 1) {
      return @()
    }
    $lines = @($lines[0..($lines.Count - 2)])
  }
  return @($lines)
}

function Initialize-NativeJobInterop {
  if ($null -ne ('Equora.NativeJob' -as [type])) {
    return
  }

  Add-Type -TypeDefinition @"
using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;

namespace Equora
{
    [StructLayout(LayoutKind.Sequential)]
    internal struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct BasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public IntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct ExtendedLimitInformation
    {
        public BasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct SecurityAttributes
    {
        public int Length;
        public IntPtr SecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)]
        public bool InheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct StartupInfo
    {
        public int Size;
        public string Reserved;
        public string Desktop;
        public string Title;
        public int X;
        public int Y;
        public int XSize;
        public int YSize;
        public int XCountChars;
        public int YCountChars;
        public int FillAttribute;
        public int Flags;
        public short ShowWindow;
        public short Reserved2Size;
        public IntPtr Reserved2;
        public IntPtr StandardInput;
        public IntPtr StandardOutput;
        public IntPtr StandardError;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct StartupInfoEx
    {
        public StartupInfo StartupInfo;
        public IntPtr AttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct ProcessInformation
    {
        public IntPtr Process;
        public IntPtr Thread;
        public int ProcessId;
        public int ThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct BasicAccountingInformation
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    public sealed class NativeRunResult
    {
        public int ExitCode { get; set; }
        public bool TimedOut { get; set; }
        public string StandardOutput { get; set; }
        public string StandardError { get; set; }
        public string ProcessTreeBoundary { get; set; }
        public bool CleanupVerified { get; set; }
    }

    public static class NativeJob
    {
        private const int ExtendedLimitInformationClass = 9;
        private const int BasicAccountingInformationClass = 1;
        private const uint KillOnJobClose = 0x00002000;
        private const uint CreateSuspended = 0x00000004;
        private const uint CreateNoWindow = 0x08000000;
        private const uint CreateUnicodeEnvironment = 0x00000400;
        private const uint ExtendedStartupInfoPresent = 0x00080000;
        private const int StartfUseStdHandles = 0x00000100;
        private const uint HandleFlagInherit = 0x00000001;
        private const uint WaitObject0 = 0x00000000;
        private const uint WaitTimeout = 0x00000102;
        private const uint WaitFailed = 0xFFFFFFFF;
        private static readonly IntPtr ProcThreadAttributeHandleList = new IntPtr(0x00020002);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct ProcessEntry32
        {
            public uint Size;
            public uint Usage;
            public uint ProcessId;
            public UIntPtr DefaultHeapId;
            public uint ModuleId;
            public uint ThreadCount;
            public uint ParentProcessId;
            public int BasePriority;
            public uint Flags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string ExeFile;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateJobObject(IntPtr securityAttributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(
            IntPtr job,
            int informationClass,
            IntPtr information,
            uint informationLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateProcess(IntPtr process, uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint ResumeThread(IntPtr thread);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool QueryInformationJobObject(
            IntPtr job,
            int informationClass,
            IntPtr information,
            uint informationLength,
            IntPtr returnLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CreatePipe(
            out IntPtr readPipe,
            out IntPtr writePipe,
            ref SecurityAttributes attributes,
            uint size);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetHandleInformation(
            IntPtr handle,
            uint mask,
            uint flags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool InitializeProcThreadAttributeList(
            IntPtr attributeList,
            int attributeCount,
            int flags,
            ref IntPtr size);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool UpdateProcThreadAttribute(
            IntPtr attributeList,
            uint flags,
            IntPtr attribute,
            IntPtr value,
            IntPtr size,
            IntPtr previousValue,
            IntPtr returnSize);

        [DllImport("kernel32.dll")]
        private static extern void DeleteProcThreadAttributeList(IntPtr attributeList);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CreateProcessW(
            string applicationName,
            StringBuilder commandLine,
            IntPtr processAttributes,
            IntPtr threadAttributes,
            bool inheritHandles,
            uint creationFlags,
            IntPtr environment,
            string currentDirectory,
            ref StartupInfoEx startupInfo,
            out ProcessInformation processInformation);

        private static IntPtr CreateKillOnCloseJob()
        {
            var job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to create native process job.");
            }

            var information = new ExtendedLimitInformation();
            information.BasicLimitInformation.LimitFlags = KillOnJobClose;
            var length = Marshal.SizeOf(typeof(ExtendedLimitInformation));
            var pointer = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(information, pointer, false);
                if (!SetInformationJobObject(job, ExtendedLimitInformationClass, pointer, (uint)length))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to configure native process job.");
                }
                return job;
            }
            catch
            {
                CloseHandle(job);
                throw;
            }
            finally
            {
                Marshal.FreeHGlobal(pointer);
            }
        }

        private static void CloseChecked(ref IntPtr handle, string description, bool forceFailure = false)
        {
            if (handle == IntPtr.Zero)
            {
                return;
            }
            var value = handle;
            var closed = forceFailure ? false : CloseHandle(value);
            if (!closed)
            {
                var error = forceFailure ? 6 : Marshal.GetLastWin32Error();
                var message = forceFailure
                    ? "Injected native job-close verification failure."
                    : "Unable to close " + description + ".";
                throw new Win32Exception(error, message);
            }
            handle = IntPtr.Zero;
        }

        private static void CloseBestEffort(ref IntPtr handle)
        {
            if (handle != IntPtr.Zero)
            {
                if (!CloseHandle(handle))
                {
                    Thread.Sleep(10);
                    if (!CloseHandle(handle)) return;
                }
                handle = IntPtr.Zero;
            }
        }

        private static void MakeParentOnly(IntPtr handle, string description)
        {
            if (!SetHandleInformation(handle, HandleFlagInherit, 0))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to protect " + description + " from inheritance.");
            }
        }

        private static uint RemainingMilliseconds(Stopwatch stopwatch, int timeoutSeconds)
        {
            var remaining = ((long)timeoutSeconds * 1000L) - stopwatch.ElapsedMilliseconds;
            if (remaining <= 0)
            {
                return 0;
            }
            return (uint)Math.Min(remaining, (long)UInt32.MaxValue - 1L);
        }

        private static uint ActiveProcesses(IntPtr job)
        {
            var size = Marshal.SizeOf(typeof(BasicAccountingInformation));
            var pointer = Marshal.AllocHGlobal(size);
            try
            {
                if (!QueryInformationJobObject(job, BasicAccountingInformationClass, pointer, (uint)size, IntPtr.Zero))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to query native process job accounting.");
                }
                return ((BasicAccountingInformation)Marshal.PtrToStructure(pointer, typeof(BasicAccountingInformation))).ActiveProcesses;
            }
            finally
            {
                Marshal.FreeHGlobal(pointer);
            }
        }

        private static void TerminateAndProveEmpty(IntPtr job, IntPtr process)
        {
            if (job != IntPtr.Zero && ActiveProcesses(job) > 0)
            {
                if (!TerminateJobObject(job, 0xE0000001))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to terminate native process job.");
                }
            }
            var cleanup = Stopwatch.StartNew();
            while (job != IntPtr.Zero && ActiveProcesses(job) > 0 && cleanup.ElapsedMilliseconds < 5000)
            {
                Thread.Sleep(20);
            }
            if (job != IntPtr.Zero && ActiveProcesses(job) > 0)
            {
                throw new InvalidOperationException("Native process job was not empty within the shared five-second cleanup deadline.");
            }
            if (process != IntPtr.Zero)
            {
                var remaining = Math.Max(0L, 5000L - cleanup.ElapsedMilliseconds);
                var wait = WaitForSingleObject(process, (uint)remaining);
                if (wait != WaitObject0)
                {
                    throw new InvalidOperationException("Native root termination was not proven within the shared five-second cleanup deadline.");
                }
            }
        }

        private static string BuildEnvironmentBlock(string[] entries)
        {
            var unique = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in entries.Where(delegate(string value) { return !String.IsNullOrEmpty(value); }))
            {
                var separator = entry.IndexOf('=');
                if (separator <= 0)
                    throw new InvalidOperationException("Native environment entry has no valid variable name.");
                var name = entry.Substring(0, separator);
                if (unique.ContainsKey(name))
                    throw new InvalidOperationException("Duplicate native environment variable: " + name + ".");
                unique.Add(name, entry);
            }
            var normalized = unique.Values
                .OrderBy(delegate(string value) { return value; }, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            return String.Join("\0", normalized) + "\0\0";
        }

        public static NativeRunResult RunSuspended(
            string executablePath,
            string arguments,
            string[] environmentEntries,
            byte[] standardInput,
            int timeoutSeconds,
            bool forceAssignmentFailure,
            bool forceCloseFailure)
        {
            var stopwatch = Stopwatch.StartNew();
            IntPtr job = IntPtr.Zero;
            IntPtr process = IntPtr.Zero;
            IntPtr thread = IntPtr.Zero;
            IntPtr childStdin = IntPtr.Zero;
            IntPtr parentStdin = IntPtr.Zero;
            IntPtr parentStdout = IntPtr.Zero;
            IntPtr childStdout = IntPtr.Zero;
            IntPtr parentStderr = IntPtr.Zero;
            IntPtr childStderr = IntPtr.Zero;
            IntPtr attributeList = IntPtr.Zero;
            IntPtr handleList = IntPtr.Zero;
            IntPtr environment = IntPtr.Zero;
            FileStream inputStream = null;
            StreamReader outputReader = null;
            StreamReader errorReader = null;
            Task inputTask = null;
            Task<string> outputTask = null;
            Task<string> errorTask = null;
            var resumed = false;
            var processId = 0;
            try
            {
                job = CreateKillOnCloseJob();
                var security = new SecurityAttributes();
                security.Length = Marshal.SizeOf(typeof(SecurityAttributes));
                security.InheritHandle = true;
                if (!CreatePipe(out childStdin, out parentStdin, ref security, 0))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to create native stdin pipe.");
                if (!CreatePipe(out parentStdout, out childStdout, ref security, 0))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to create native stdout pipe.");
                if (!CreatePipe(out parentStderr, out childStderr, ref security, 0))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to create native stderr pipe.");
                MakeParentOnly(parentStdin, "native stdin writer");
                MakeParentOnly(parentStdout, "native stdout reader");
                MakeParentOnly(parentStderr, "native stderr reader");

                var attributeBytes = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeBytes);
                attributeList = Marshal.AllocHGlobal(attributeBytes);
                if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeBytes))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to initialize the explicit native handle list.");
                handleList = Marshal.AllocHGlobal(IntPtr.Size * 3);
                Marshal.WriteIntPtr(handleList, 0, childStdin);
                Marshal.WriteIntPtr(handleList, IntPtr.Size, childStdout);
                Marshal.WriteIntPtr(handleList, IntPtr.Size * 2, childStderr);
                if (!UpdateProcThreadAttribute(
                    attributeList,
                    0,
                    ProcThreadAttributeHandleList,
                    handleList,
                    new IntPtr(IntPtr.Size * 3),
                    IntPtr.Zero,
                    IntPtr.Zero))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to set the explicit native handle list.");

                var startup = new StartupInfoEx();
                startup.StartupInfo.Size = Marshal.SizeOf(typeof(StartupInfoEx));
                startup.StartupInfo.Flags = StartfUseStdHandles;
                startup.StartupInfo.StandardInput = childStdin;
                startup.StartupInfo.StandardOutput = childStdout;
                startup.StartupInfo.StandardError = childStderr;
                startup.AttributeList = attributeList;
                var environmentBlock = BuildEnvironmentBlock(environmentEntries);
                environment = Marshal.StringToHGlobalUni(environmentBlock);
                var commandLine = new StringBuilder();
                commandLine.Append('"').Append(executablePath.Replace("\"", "\\\"")).Append('"');
                if (!String.IsNullOrWhiteSpace(arguments)) commandLine.Append(' ').Append(arguments);
                ProcessInformation information;
                var created = CreateProcessW(
                    executablePath,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    true,
                    CreateSuspended | CreateNoWindow | CreateUnicodeEnvironment | ExtendedStartupInfoPresent,
                    environment,
                    Path.GetDirectoryName(executablePath),
                    ref startup,
                    out information);
                for (var index = 0; index < environmentBlock.Length; index++) Marshal.WriteInt16(environment, index * 2, 0);
                Marshal.FreeHGlobal(environment);
                environment = IntPtr.Zero;
                if (!created)
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to create suspended native process.");
                process = information.Process;
                thread = information.Thread;
                processId = information.ProcessId;
                CloseBestEffort(ref childStdin);
                CloseBestEffort(ref childStdout);
                CloseBestEffort(ref childStderr);

                if (forceAssignmentFailure)
                    throw new InvalidOperationException("Injected native job-assignment failure before target-code execution; root PID=" + processId + ".");
                if (!AssignProcessToJobObject(job, process))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to assign suspended native process to job.");
                bool assigned;
                if (!IsProcessInJob(process, job, out assigned) || !assigned)
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Native process job membership could not be proven before resume.");
                if (ResumeThread(thread) == UInt32.MaxValue)
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to resume job-contained native process.");
                resumed = true;
                CloseChecked(ref thread, "native primary thread handle");

                inputStream = new FileStream(new SafeFileHandle(parentStdin, true), FileAccess.Write, 4096, false);
                parentStdin = IntPtr.Zero;
                outputReader = new StreamReader(new FileStream(new SafeFileHandle(parentStdout, true), FileAccess.Read, 4096, false), Encoding.UTF8, true);
                parentStdout = IntPtr.Zero;
                errorReader = new StreamReader(new FileStream(new SafeFileHandle(parentStderr, true), FileAccess.Read, 4096, false), Encoding.UTF8, true);
                parentStderr = IntPtr.Zero;
                outputTask = Task.Factory.StartNew(delegate { return outputReader.ReadToEnd(); }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
                errorTask = Task.Factory.StartNew(delegate { return errorReader.ReadToEnd(); }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
                inputTask = Task.Factory.StartNew(delegate
                {
                    try
                    {
                        inputStream.Write(standardInput, 0, standardInput.Length);
                        inputStream.Flush();
                    }
                    finally
                    {
                        inputStream.Dispose();
                    }
                }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);

                var waitResult = WaitForSingleObject(process, RemainingMilliseconds(stopwatch, timeoutSeconds));
                var timedOut = waitResult == WaitTimeout;
                if (waitResult == WaitFailed)
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to wait for native process.");
                if (waitResult != WaitObject0 && !timedOut)
                    throw new InvalidOperationException("Unexpected native process wait result: " + waitResult + ".");

                try { inputStream.Dispose(); } catch (ObjectDisposedException) { }
                TerminateAndProveEmpty(job, process);
                CloseChecked(ref job, "native process job", forceCloseFailure);

                try
                {
                    if (!inputTask.Wait(5000))
                        throw new InvalidOperationException("Native stdin writer did not close within five seconds.");
                }
                catch (AggregateException)
                {
                    if (!timedOut) throw;
                }
                if (!outputTask.Wait(5000) || !errorTask.Wait(5000))
                    throw new InvalidOperationException("Native output streams did not close within five seconds.");
                uint rawExitCode;
                if (!GetExitCodeProcess(process, out rawExitCode))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to read native process exit code.");
                return new NativeRunResult
                {
                    ExitCode = timedOut ? -2 : unchecked((int)rawExitCode),
                    TimedOut = timedOut,
                    StandardOutput = outputTask.Result,
                    StandardError = errorTask.Result + (timedOut ? "EQUORA_NATIVE_PROCESS_TIMEOUT after " + timeoutSeconds + "s\n" : String.Empty),
                    ProcessTreeBoundary = "windows_suspended_kill_on_close_job",
                    CleanupVerified = true
                };
            }
            catch (Exception primaryError)
            {
                Exception cleanupError = null;
                if (process != IntPtr.Zero)
                {
                    if (!resumed)
                    {
                        if (!TerminateProcess(process, 0xE0000002))
                            cleanupError = new Win32Exception(Marshal.GetLastWin32Error(), "Unable to terminate suspended native root PID " + processId + ".");
                        else
                        {
                            var cleanupWait = WaitForSingleObject(process, 5000);
                            if (cleanupWait != WaitObject0)
                                cleanupError = new InvalidOperationException("Suspended native root PID " + processId + " termination was not proven; wait result=" + cleanupWait + ".");
                        }
                    }
                    else if (job != IntPtr.Zero)
                    {
                        try { TerminateAndProveEmpty(job, process); } catch (Exception error) { cleanupError = error; }
                    }
                }
                if (cleanupError != null)
                    throw new AggregateException("Native process failed and cleanup could not be proven.", primaryError, cleanupError);
                throw;
            }
            finally
            {
                if (inputStream != null) try { inputStream.Dispose(); } catch { }
                if (outputReader != null) try { outputReader.Dispose(); } catch { }
                if (errorReader != null) try { errorReader.Dispose(); } catch { }
                CloseBestEffort(ref childStdin);
                CloseBestEffort(ref parentStdin);
                CloseBestEffort(ref parentStdout);
                CloseBestEffort(ref childStdout);
                CloseBestEffort(ref parentStderr);
                CloseBestEffort(ref childStderr);
                CloseBestEffort(ref thread);
                CloseBestEffort(ref process);
                CloseBestEffort(ref job);
                if (attributeList != IntPtr.Zero)
                {
                    DeleteProcThreadAttributeList(attributeList);
                    Marshal.FreeHGlobal(attributeList);
                }
                if (handleList != IntPtr.Zero) Marshal.FreeHGlobal(handleList);
                if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
                stopwatch.Stop();
            }
        }
    }
}
"@
}

function Invoke-NativeProcess {
  param(
    [Parameter(Mandatory = $true)][string]$ExecutablePath,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Arguments,
    [Parameter(Mandatory = $true)][ValidateRange(1, 600)][int]$TimeoutSeconds,
    [hashtable]$EnvironmentVariables = @{},
    [byte[]]$StandardInputBytes = $null,
    [bool]$UseKillOnCloseJob = $false
  )

  $argumentText = (($Arguments | ForEach-Object {
    ConvertTo-NativeProcessArgument -Argument $_
  }) -join ' ')

  if ($UseKillOnCloseJob -and [IO.Path]::DirectorySeparatorChar -eq '\') {
    Initialize-NativeJobInterop
    $childEnvironment = [Collections.Generic.Dictionary[string,string]]::new(
      [StringComparer]::OrdinalIgnoreCase
    )
    $allowedNames = '^(?i:SystemRoot|WINDIR|TEMP|TMP|TMPDIR|LANG|LC_[A-Z_]+|TZ)$'
    foreach ($entry in [Environment]::GetEnvironmentVariables('Process').GetEnumerator()) {
      if ([string]$entry.Key -match $allowedNames) {
        $childEnvironment[[string]$entry.Key] = [string]$entry.Value
      }
    }
    foreach ($environmentName in $EnvironmentVariables.Keys) {
      $childEnvironment[[string]$environmentName] = [string]$EnvironmentVariables[$environmentName]
    }
    $environmentEntries = @($childEnvironment.GetEnumerator() | ForEach-Object {
      "$($_.Key)=$($_.Value)"
    })
    $forceAssignmentFailure = (
      [Environment]::GetEnvironmentVariable(
        'EQUORA_PREFLIGHT_TEST_FORCE_JOB_ASSIGNMENT_FAILURE',
        'Process'
      ) -ceq '1'
    )
    $forceCloseFailure = (
      [Environment]::GetEnvironmentVariable(
        'EQUORA_PREFLIGHT_TEST_FORCE_JOB_CLOSE_FAILURE',
        'Process'
      ) -ceq '1'
    )
    $nativeResult = [Equora.NativeJob]::RunSuspended(
      $ExecutablePath,
      $argumentText,
      [string[]]$environmentEntries,
      $StandardInputBytes,
      $TimeoutSeconds,
      $forceAssignmentFailure,
      $forceCloseFailure
    )
    $stdoutLines = @(ConvertFrom-NativeProcessText -Text $nativeResult.StandardOutput)
    $stderrLines = @(ConvertFrom-NativeProcessText -Text $nativeResult.StandardError)
    return [pscustomobject]@{
      exitCode = $nativeResult.ExitCode
      timedOut = $nativeResult.TimedOut
      processTreeBoundary = $nativeResult.ProcessTreeBoundary
      cleanupVerified = $nativeResult.CleanupVerified
      stdoutLines = $stdoutLines
      stderrLines = $stderrLines
      outputLines = @($stdoutLines + $stderrLines)
    }
  }

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $extension = [IO.Path]::GetExtension($ExecutablePath)
  if (
    [IO.Path]::DirectorySeparatorChar -eq '\' -and
    ($extension -ieq '.cmd' -or $extension -ieq '.bat')
  ) {
    throw 'The selected psql command must be a native executable, not a command wrapper.'
  }
  $startInfo.FileName = $ExecutablePath
  $startInfo.Arguments = $argumentText
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.RedirectStandardInput = $null -ne $StandardInputBytes
  $allowedParentEnvironment = @{}
  foreach ($parentEnvironmentName in @($startInfo.EnvironmentVariables.Keys)) {
    if ($parentEnvironmentName -match '^(?i:PATH|SystemRoot|WINDIR|TEMP|TMP|TMPDIR|LANG|LC_[A-Z_]+|TZ)$') {
      $allowedParentEnvironment[$parentEnvironmentName] = `
        $startInfo.EnvironmentVariables[$parentEnvironmentName]
    }
  }
  $startInfo.EnvironmentVariables.Clear()
  foreach ($environmentName in $allowedParentEnvironment.Keys) {
    $startInfo.EnvironmentVariables[$environmentName] = `
      [string]$allowedParentEnvironment[$environmentName]
  }
  foreach ($environmentName in $EnvironmentVariables.Keys) {
    $startInfo.EnvironmentVariables[$environmentName] = `
      [string]$EnvironmentVariables[$environmentName]
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $jobHandle = [IntPtr]::Zero
  $processTreeBoundary = 'direct_process'
  try {
    if (-not $process.Start()) {
      throw "Unable to start native process: $ExecutablePath"
    }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if ($null -ne $StandardInputBytes) {
      try {
        $process.StandardInput.BaseStream.Write(
          $StandardInputBytes,
          0,
          $StandardInputBytes.Length
        )
        $process.StandardInput.BaseStream.Flush()
      }
      finally {
        $process.StandardInput.Close()
      }
    }
    $timedOut = -not $process.WaitForExit($TimeoutSeconds * 1000)
    if ($timedOut) {
      $cleanupMessages = @()
      $trackedDescendants = @()
      if ([IO.Path]::DirectorySeparatorChar -eq '\') {
        try {
          $descendantProcessIds = @(
            [Equora.NativeJob]::GetDescendantProcessIds($process.Id)
          )
          [array]::Reverse($descendantProcessIds)
          foreach ($descendantProcessId in $descendantProcessIds) {
            try {
              $descendantProcess = [Diagnostics.Process]::GetProcessById(
                $descendantProcessId
              )
              [void]$descendantProcess.Handle
              $trackedDescendants += $descendantProcess
            }
            catch [ArgumentException] {
              # The snapshotted process exited before its stable handle was opened.
            }
            catch {
              $cleanupMessages += (
                "Unable to open snapshotted descendant $descendantProcessId`: " +
                $_.Exception.Message
              )
            }
          }
        }
        catch {
          $cleanupMessages += (
            'Unable to snapshot the native process tree before termination: ' +
            $_.Exception.Message
          )
        }
      }
      if ($jobHandle -ne [IntPtr]::Zero) {
        try {
          [Equora.NativeJob]::CloseJob($jobHandle)
          $jobHandle = [IntPtr]::Zero
        }
        catch {
          $cleanupMessages += $_.Exception.Message
        }
      }
      $trackedProcesses = @($trackedDescendants) + @($process)
      foreach ($trackedProcess in $trackedProcesses) {
        try {
          if (-not $trackedProcess.HasExited) { $trackedProcess.Kill() }
        }
        catch {
          if (-not $trackedProcess.HasExited) {
            $cleanupMessages += (
              "Unable to terminate tracked process $($trackedProcess.Id): " +
              $_.Exception.Message
            )
          }
        }
      }
      $cleanupDeadline = [Diagnostics.Stopwatch]::StartNew()
      foreach ($trackedProcess in $trackedProcesses) {
        try {
          $remainingMilliseconds = [Math]::Max(
            0,
            5000 - [int]$cleanupDeadline.ElapsedMilliseconds
          )
          if (
            -not $trackedProcess.HasExited -and
            ($remainingMilliseconds -eq 0 -or
              -not $trackedProcess.WaitForExit($remainingMilliseconds))
          ) {
            $cleanupMessages += (
              "Tracked process $($trackedProcess.Id) did not exit within " +
              'the shared five-second cleanup deadline.'
            )
          }
        }
        catch {
          $cleanupMessages += (
            "Unable to prove tracked process $($trackedProcess.Id) exited: " +
            $_.Exception.Message
          )
        }
      }
      $cleanupDeadline.Stop()
      foreach ($descendantProcess in $trackedDescendants) {
        $descendantProcess.Dispose()
      }
      if ($cleanupMessages.Count -gt 0) {
        throw (
          'Native process cleanup was not fully proven: ' +
          [string]::Join('; ', $cleanupMessages)
        )
      }
    }
    if (-not $stdoutTask.Wait(5000) -or -not $stderrTask.Wait(5000)) {
      throw 'Native process output streams did not close within five seconds.'
    }
    $stdoutText = $stdoutTask.GetAwaiter().GetResult()
    $stderrText = $stderrTask.GetAwaiter().GetResult()
    $stdoutLines = @(ConvertFrom-NativeProcessText -Text $stdoutText)
    $stderrLines = @(ConvertFrom-NativeProcessText -Text $stderrText)
    if ($timedOut) {
      $stderrLines += "EQUORA_NATIVE_PROCESS_TIMEOUT after ${TimeoutSeconds}s"
    }
    return [pscustomobject]@{
      exitCode = $(if ($timedOut) { -2 } else { $process.ExitCode })
      timedOut = $timedOut
      processTreeBoundary = $processTreeBoundary
      cleanupVerified = $true
      stdoutLines = $stdoutLines
      stderrLines = $stderrLines
      outputLines = @($stdoutLines + $stderrLines)
    }
  }
  finally {
    $process.Dispose()
  }
}

function Protect-PreflightOutputLines {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][AllowEmptyString()][string[]]$Lines,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$SensitiveValues
  )

  $redactions = @(
    $SensitiveValues |
      Where-Object { -not [string]::IsNullOrEmpty($_) } |
      Sort-Object -Property Length -Descending
  )
  return @($Lines | ForEach-Object {
    $protectedLine = "$_"
    foreach ($redaction in $redactions) {
      $protectedLine = $protectedLine.Replace($redaction, '[REDACTED]')
    }
    $protectedLine
  })
}

function Get-CrlfNormalizedBytes {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  $stream = [IO.MemoryStream]::new()
  try {
    for ($index = 0; $index -lt $Bytes.Length; $index += 1) {
      if (
        $Bytes[$index] -eq 13 -and
        ($index + 1) -lt $Bytes.Length -and
        $Bytes[$index + 1] -eq 10
      ) {
        $stream.WriteByte(10)
        $index += 1
      }
      else {
        $stream.WriteByte($Bytes[$index])
      }
    }
    return $stream.ToArray()
  }
  finally {
    $stream.Dispose()
  }
}

function Get-PreflightExecutionBytes {
  param(
    [Parameter(Mandatory = $true)][byte[]]$PreflightBytes,
    [Parameter(Mandatory = $true)][byte[]]$VerifierBytes
  )

  $strictUtf8 = [Text.UTF8Encoding]::new($false, $true)
  $preflightText = $strictUtf8.GetString($PreflightBytes)
  $verifierText = $strictUtf8.GetString($VerifierBytes)
  $includeLine = '\ir verify-v57.62.0-trade-import.sql'
  $includeCount = ([regex]::Matches(
    $preflightText,
    '(?m)^\s*\\ir\s+verify-v57\.62\.0-trade-import\.sql\s*$'
  )).Count
  if ($includeCount -ne 1) {
    throw 'Preflight SQL must contain exactly one reviewed verifier include.'
  }
  $executionText = $preflightText.Replace($includeLine, $verifierText.TrimEnd("`n"))
  $allowedMetaCommands = @('set', 'pset', 'gset', 'if', 'else', 'endif', 'echo')
  foreach ($line in @($executionText -split "`n")) {
    $metaCommand = [regex]::Match($line, '^\s*\\([A-Za-z]+)')
    if (
      $metaCommand.Success -and
      $metaCommand.Groups[1].Value.ToLowerInvariant() -notin $allowedMetaCommands
    ) {
      throw "Preflight SQL contains a disallowed psql meta-command: $line"
    }
  }
  return $strictUtf8.GetBytes($executionText)
}

function Invoke-GitText {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = & git -c "safe.directory=$script:RepositoryRoot" `
    -C $script:RepositoryRoot @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: $($output -join [Environment]::NewLine)"
  }
  return ($output | Out-String).Trim()
}

function Assert-RequiredValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowEmptyString()][string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required in ExecuteReadOnly mode."
  }
}

function Test-FullyQualifiedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not [IO.Path]::IsPathRooted($Path)) {
    return $false
  }
  if ([IO.Path]::DirectorySeparatorChar -eq '\') {
    if ($Path -notmatch '^[A-Za-z]:[\\/]') {
      return $false
    }
    if ($Path -match '(?:^|[\\/])[^\\/]*~[0-9]+[^\\/]*(?:[\\/]|$)') {
      return $false
    }
    return $true
  }
  return $Path.StartsWith('/', [StringComparison]::Ordinal)
}

function Get-WindowsDosDeviceTarget {
  param([Parameter(Mandatory = $true)][string]$DriveRoot)

  if ([IO.Path]::DirectorySeparatorChar -ne '\') {
    return $null
  }

  $driveName = $DriveRoot.TrimEnd([char[]]@('\', '/'))
  if ($driveName -notmatch '^[A-Za-z]:$') {
    throw "Cannot resolve DOS-device target for invalid drive root: $DriveRoot"
  }

  if ($null -eq ('EquoraPathNativeMethods' -as [type])) {
    Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;

public static class EquoraPathNativeMethods
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint QueryDosDevice(
        string lpDeviceName,
        StringBuilder lpTargetPath,
        int ucchMax
    );
}
'@
  }

  $targetBuffer = [Text.StringBuilder]::new(32768)
  $targetLength = [EquoraPathNativeMethods]::QueryDosDevice(
    $driveName,
    $targetBuffer,
    $targetBuffer.Capacity
  )
  if ($targetLength -eq 0) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "Cannot resolve DOS-device target for $driveName (Win32 error $errorCode)."
  }

  return $targetBuffer.ToString()
}

function Assert-TrustedWindowsDriveDescriptor {
  param(
    [Parameter(Mandatory = $true)][string]$ValueName,
    [Parameter(Mandatory = $true)][string]$DriveRoot,
    [Parameter(Mandatory = $true)][string]$DriveType,
    [Parameter(Mandatory = $true)][string]$IsReady,
    [Parameter(Mandatory = $true)][string]$DosDeviceTarget,
    [Parameter(Mandatory = $true)][string]$RepositoryDriveRoot,
    [Parameter(Mandatory = $true)][string]$RepositoryDosDeviceTarget
  )

  if ($DriveType -cne 'Fixed' -or $IsReady -cne 'true') {
    throw "$ValueName must be located on a ready fixed local drive."
  }
  if (
    $DosDeviceTarget.StartsWith('\??\', [StringComparison]::OrdinalIgnoreCase) -or
    $DosDeviceTarget.StartsWith('\DosDevices\', [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "$ValueName must not use a SUBST or DOS-device alias."
  }
  if (-not $DosDeviceTarget.StartsWith('\Device\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "$ValueName must resolve directly to a recognized local device."
  }
  if (
    -not $DriveRoot.Equals(
      $RepositoryDriveRoot,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    $repositoryDevicePrefix = (
      $RepositoryDosDeviceTarget.TrimEnd([char[]]@('\', '/')) + '\'
    )
    $aliasesRepositoryVolume = (
      $DosDeviceTarget.Equals(
        $RepositoryDosDeviceTarget,
        [StringComparison]::OrdinalIgnoreCase
      ) -or
      $DosDeviceTarget.StartsWith(
        $repositoryDevicePrefix,
        [StringComparison]::OrdinalIgnoreCase
      )
    )
    if ($aliasesRepositoryVolume) {
      throw "$ValueName must not alias the repository volume through another drive letter."
    }
  }
}

function Assert-TrustedWindowsDrive {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ValueName
  )

  if ([IO.Path]::DirectorySeparatorChar -ne '\') {
    return
  }

  $driveRoot = [IO.Path]::GetPathRoot($Path)
  $repositoryDriveRoot = [IO.Path]::GetPathRoot($script:RepositoryRoot)
  $driveInfo = [IO.DriveInfo]::new($driveRoot)
  $dosDeviceTarget = Get-WindowsDosDeviceTarget -DriveRoot $driveRoot
  $repositoryDosDeviceTarget = Get-WindowsDosDeviceTarget -DriveRoot $repositoryDriveRoot

  Assert-TrustedWindowsDriveDescriptor -ValueName $ValueName -DriveRoot $driveRoot -DriveType $driveInfo.DriveType.ToString() -IsReady $driveInfo.IsReady.ToString().ToLowerInvariant() -DosDeviceTarget $dosDeviceTarget -RepositoryDriveRoot $repositoryDriveRoot -RepositoryDosDeviceTarget $repositoryDosDeviceTarget
}

function Resolve-ExternalEvidenceDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-FullyQualifiedPath -Path $Path)) {
    throw 'EvidenceDirectory must be a fully qualified absolute path.'
  }
  Assert-TrustedWindowsDrive -Path $Path -ValueName 'EvidenceDirectory'

  $fullPath = [IO.Path]::GetFullPath($Path)
  $pathRoot = [IO.Path]::GetPathRoot($fullPath)
  if ($fullPath.Equals($pathRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'EvidenceDirectory must not be a filesystem root.'
  }

  $trimCharacters = [char[]]@(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  $candidatePath = $fullPath.TrimEnd($trimCharacters)
  $repositoryPath = ([IO.Path]::GetFullPath($script:RepositoryRoot)).TrimEnd(
    $trimCharacters
  )
  $repositoryPrefix = $repositoryPath + [IO.Path]::DirectorySeparatorChar
  $isRepositoryRoot = $candidatePath.Equals(
    $repositoryPath,
    [StringComparison]::OrdinalIgnoreCase
  )
  $isRepositoryChild = $candidatePath.StartsWith(
    $repositoryPrefix,
    [StringComparison]::OrdinalIgnoreCase
  )
  if ($isRepositoryRoot -or $isRepositoryChild) {
    throw 'EvidenceDirectory must be outside the repository.'
  }

  $pathCursor = [IO.DirectoryInfo]::new($candidatePath)
  while ($null -ne $pathCursor) {
    if (
      $pathCursor.Exists -and
      (($pathCursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
    ) {
      throw 'EvidenceDirectory must not traverse a reparse point or symbolic link.'
    }
    $pathCursor = $pathCursor.Parent
  }

  return $candidatePath
}

function Set-OwnerOnlyEvidenceDirectoryAcl {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ([IO.Path]::DirectorySeparatorChar -ne '\') {
    return
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $security = [Security.AccessControl.DirectorySecurity]::new()
  $security.SetOwner($identity.User)
  $security.SetAccessRuleProtection($true, $false)
  $inheritance = (
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [Security.AccessControl.InheritanceFlags]::ObjectInherit
  )
  $rule = [Security.AccessControl.FileSystemAccessRule]::new(
    $identity.User,
    [Security.AccessControl.FileSystemRights]::FullControl,
    $inheritance,
    [Security.AccessControl.PropagationFlags]::None,
    [Security.AccessControl.AccessControlType]::Allow
  )
  [void]$security.AddAccessRule($rule)
  $directoryInfo = [IO.DirectoryInfo]::new($Path)
  $setAccessControl = $directoryInfo.GetType().GetMethod(
    'SetAccessControl',
    [type[]]@([Security.AccessControl.DirectorySecurity])
  )
  if ($null -ne $setAccessControl) {
    [void]$setAccessControl.Invoke($directoryInfo, @($security))
  }
  else {
    [IO.FileSystemAclExtensions]::SetAccessControl($directoryInfo, $security)
  }
}

function Set-OwnerReadExecuteSnapshotAcl {
  param([Parameter(Mandatory = $true)][string]$Path)

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $inheritance = (
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [Security.AccessControl.InheritanceFlags]::ObjectInherit
  )
  $security = [Security.AccessControl.DirectorySecurity]::new()
  $security.SetOwner($identity.User)
  $security.SetAccessRuleProtection($true, $false)
  [void]$security.AddAccessRule(
    [Security.AccessControl.FileSystemAccessRule]::new(
      $identity.User,
      (
        [Security.AccessControl.FileSystemRights]::ReadAndExecute -bor
        [Security.AccessControl.FileSystemRights]::ChangePermissions
      ),
      $inheritance,
      [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow
    )
  )
  $directoryInfo = [IO.DirectoryInfo]::new($Path)
  $setAccessControl = $directoryInfo.GetType().GetMethod(
    'SetAccessControl',
    [type[]]@([Security.AccessControl.DirectorySecurity])
  )
  if ($null -ne $setAccessControl) {
    [void]$setAccessControl.Invoke($directoryInfo, @($security))
  }
  else {
    [IO.FileSystemAclExtensions]::SetAccessControl($directoryInfo, $security)
  }

  $probePath = Join-Path $Path ('.equora-write-probe-' + [Guid]::NewGuid().ToString('N'))
  $probe = $null
  try {
    $probe = [IO.FileStream]::new(
      $probePath,
      [IO.FileMode]::CreateNew,
      [IO.FileAccess]::Write,
      [IO.FileShare]::None
    )
  }
  catch [UnauthorizedAccessException] {
    return
  }
  finally {
    if ($null -ne $probe) {
      $probe.Dispose()
    }
  }
  if (Test-Path -LiteralPath $probePath -PathType Leaf) {
    Remove-Item -LiteralPath $probePath -Force
  }
  throw 'The psql execution snapshot remained writable after ACL hardening.'
}

function Remove-OwnerProtectedSnapshotDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $security = [Security.AccessControl.DirectorySecurity]::new()
  $security.SetAccessRuleProtection($true, $false)
  $inheritance = (
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [Security.AccessControl.InheritanceFlags]::ObjectInherit
  )
  [void]$security.AddAccessRule(
    [Security.AccessControl.FileSystemAccessRule]::new(
      $identity.User,
      [Security.AccessControl.FileSystemRights]::FullControl,
      $inheritance,
      [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow
    )
  )
  $directoryInfo = [IO.DirectoryInfo]::new($Path)
  $setAccessControl = $directoryInfo.GetType().GetMethod(
    'SetAccessControl',
    [type[]]@([Security.AccessControl.DirectorySecurity])
  )
  if ($null -ne $setAccessControl) {
    [void]$setAccessControl.Invoke($directoryInfo, @($security))
  }
  else {
    [IO.FileSystemAclExtensions]::SetAccessControl($directoryInfo, $security)
  }
  [IO.Directory]::Delete($Path, $true)
}

function Resolve-ProductionConnectionTarget {
  param(
    [Parameter(Mandatory = $true)][string]$ConnectionUrl,
    [Parameter(Mandatory = $true)][string]$ExpectedProjectRef,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseHost
  )

  $connectionUri = $null
  if (-not [Uri]::TryCreate($ConnectionUrl, [UriKind]::Absolute, [ref]$connectionUri)) {
    throw 'Production database URL is not a valid absolute URI.'
  }
  if ($connectionUri.Scheme -notin @('postgres', 'postgresql')) {
    throw 'Production database URL must use postgres or postgresql.'
  }

  $expectedHost = $ExpectedDatabaseHost.Trim().TrimEnd('.').ToLowerInvariant()
  if (
    [string]::IsNullOrWhiteSpace($expectedHost) -or
    [Uri]::CheckHostName($expectedHost) -ne [UriHostNameType]::Dns
  ) {
    throw 'ExpectedDatabaseHost must be one exact DNS hostname.'
  }

  $databaseHost = $connectionUri.DnsSafeHost.TrimEnd('.').ToLowerInvariant()
  if ($databaseHost -cne $expectedHost) {
    throw 'Database URL host does not match ExpectedDatabaseHost.'
  }

  $userInfoSeparator = $connectionUri.UserInfo.IndexOf(':')
  if ($userInfoSeparator -lt 1) {
    throw 'Production database URL must contain both user and password.'
  }
  $databaseUser = [Uri]::UnescapeDataString(
    $connectionUri.UserInfo.Substring(0, $userInfoSeparator)
  )
  $databasePassword = [Uri]::UnescapeDataString(
    $connectionUri.UserInfo.Substring($userInfoSeparator + 1)
  )
  if ([string]::IsNullOrEmpty($databasePassword)) {
    throw 'Production database URL password is empty.'
  }
  if ($databaseUser -match '[\x00-\x1F\x7F]' -or $databasePassword -match '[\x00-\x1F\x7F]') {
    throw 'Production database URL credentials must not contain control characters.'
  }

  $databaseName = $connectionUri.AbsolutePath.Trim('/')
  $databasePort = if ($connectionUri.IsDefaultPort) { 5432 } else { $connectionUri.Port }
  if ($databasePort -ne 5432) {
    throw 'Production preflight requires direct or shared session-pooler port 5432.'
  }
  if ($databaseName -cne 'postgres') {
    throw 'Production preflight requires database postgres.'
  }

  $requiredDirectHost = "db.$ExpectedProjectRef.supabase.co"
  $isDirectTarget = (
    $expectedHost -ceq $requiredDirectHost -and
    $databaseUser -ceq 'postgres'
  )
  $isSessionPoolerHost = $expectedHost -match (
    '^[a-z0-9]+-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$'
  )
  $isSessionPoolerTarget = (
    $isSessionPoolerHost -and
    $databaseUser -ceq "postgres.$ExpectedProjectRef"
  )
  if (-not ($isDirectTarget -or $isSessionPoolerTarget)) {
    throw 'Database target is not an accepted direct or shared session-pooler identity.'
  }

  return [ordered]@{
    connectionType = if ($isDirectTarget) { 'direct' } else { 'shared_session_pooler' }
    databaseHost = $databaseHost
    databasePort = $databasePort
    databaseName = $databaseName
    databaseUser = $databaseUser
    databasePassword = $databasePassword
  }
}

function Resolve-TrustedRootCertificate {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ExpectedSha256
  )

  if ($ExpectedSha256 -notmatch '^[A-Fa-f0-9]{64}$') {
    throw 'ExpectedSslRootCertificateSha256 must be exactly 64 hexadecimal characters.'
  }

  if (-not (Test-FullyQualifiedPath -Path $Path)) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must be a fully qualified absolute path.'
  }
  Assert-TrustedWindowsDrive -Path $Path -ValueName 'EQUORA_SUPABASE_SSL_ROOT_CERT'
  $certificatePath = [IO.Path]::GetFullPath($Path)
  if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must reference an existing file.'
  }

  $trimCharacters = [char[]]@(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  $repositoryPath = ([IO.Path]::GetFullPath($script:RepositoryRoot)).TrimEnd(
    $trimCharacters
  )
  $repositoryPrefix = $repositoryPath + [IO.Path]::DirectorySeparatorChar
  if (
    $certificatePath.Equals($repositoryPath, [StringComparison]::OrdinalIgnoreCase) -or
    $certificatePath.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must be outside the repository.'
  }

  $certificateFile = [IO.FileInfo]::new($certificatePath)
  if (
    ($certificateFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  ) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must not traverse a reparse point or symbolic link.'
  }
  $pathCursor = $certificateFile.Directory
  while ($null -ne $pathCursor) {
    if (
      $pathCursor.Exists -and
      (($pathCursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
    ) {
      throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must not traverse a reparse point or symbolic link.'
    }
    $pathCursor = $pathCursor.Parent
  }

  $certificateBytes = [IO.File]::ReadAllBytes($certificatePath)
  if ($certificateBytes.Length -eq 0) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must not be empty.'
  }
  $actualSha256 = Get-Sha256Hex -Bytes $certificateBytes
  if ($actualSha256 -cne $ExpectedSha256.ToUpperInvariant()) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT does not match ExpectedSslRootCertificateSha256.'
  }
  return [ordered]@{
    path = $certificatePath
    expectedSha256 = $ExpectedSha256.ToUpperInvariant()
    sha256 = $actualSha256
    bytes = $certificateBytes
  }
}

function Resolve-TrustedPsqlExecutable {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [switch]$KeepOpen
  )

  if (-not (Test-FullyQualifiedPath -Path $Path)) {
    throw 'PsqlExecutablePath must be a fully qualified absolute path.'
  }
  if ($ExpectedSha256 -notmatch '^[A-Fa-f0-9]{64}$') {
    throw 'ExpectedPsqlSha256 must be exactly 64 hexadecimal characters.'
  }
  Assert-TrustedWindowsDrive -Path $Path -ValueName 'PsqlExecutablePath'
  $executablePath = [IO.Path]::GetFullPath($Path)
  if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw 'PsqlExecutablePath must reference an existing file.'
  }
  if (
    [IO.Path]::DirectorySeparatorChar -eq '\' -and
    [IO.Path]::GetExtension($executablePath) -ine '.exe'
  ) {
    throw 'PsqlExecutablePath must reference a native .exe on Windows.'
  }

  $executableFile = [IO.FileInfo]::new($executablePath)
  if (($executableFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'PsqlExecutablePath must not traverse a reparse point or symbolic link.'
  }
  $pathCursor = $executableFile.Directory
  while ($null -ne $pathCursor) {
    if (
      $pathCursor.Exists -and
      (($pathCursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
    ) {
      throw 'PsqlExecutablePath must not traverse a reparse point or symbolic link.'
    }
    $pathCursor = $pathCursor.Parent
  }

  $executableLease = $null
  $retainLease = $false
  try {
    $executableLease = [IO.FileStream]::new(
      $executablePath,
      [IO.FileMode]::Open,
      [IO.FileAccess]::Read,
      [IO.FileShare]::Read
    )
    $actualSha256 = Get-Sha256HexFromStream -Stream $executableLease
    if ($actualSha256 -cne $ExpectedSha256.ToUpperInvariant()) {
      throw 'PsqlExecutablePath does not match ExpectedPsqlSha256.'
    }
    $result = [ordered]@{
      path = $executablePath
      sha256 = $actualSha256
      lease = $(if ($KeepOpen) { $executableLease } else { $null })
    }
    if ($KeepOpen) {
      $retainLease = $true
    }
    else {
      $executableLease.Dispose()
      $executableLease = $null
    }
    return $result
  }
  finally {
    if ($null -ne $executableLease -and -not $retainLease) {
      $executableLease.Dispose()
    }
  }
}

function Resolve-TrustedPsqlBundle {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedExecutableSha256,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ExpectedBundleSha256,
    [switch]$KeepOpen
  )

  if ($ExpectedBundleSha256 -notmatch '^[A-Fa-f0-9]{64}$') {
    throw 'ExpectedPsqlBundleSha256 must be exactly 64 hexadecimal characters.'
  }
  $executable = Resolve-TrustedPsqlExecutable `
    -Path $Path `
    -ExpectedSha256 $ExpectedExecutableSha256
  $bundleDirectory = [IO.Path]::GetDirectoryName($executable.path)
  [string[]]$bundlePaths = @(
    [IO.Directory]::EnumerateFiles(
      $bundleDirectory,
      '*',
      [IO.SearchOption]::TopDirectoryOnly
    )
  )
  [Array]::Sort($bundlePaths, [StringComparer]::Ordinal)
  $leases = [Collections.ArrayList]::new()
  $bundleFiles = [Collections.ArrayList]::new()
  $retainLeases = $false
  try {
    $manifestBuilder = [Text.StringBuilder]::new()
    foreach ($bundlePath in $bundlePaths) {
      $bundleFile = [IO.FileInfo]::new($bundlePath)
      if (($bundleFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'The approved psql bundle must not contain reparse points or symbolic links.'
      }
      $lease = [IO.FileStream]::new(
        $bundlePath,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Read,
        [IO.FileShare]::Read
      )
      [void]$leases.Add($lease)
      $fileSha256 = Get-Sha256HexFromStream -Stream $lease
      [void]$bundleFiles.Add([ordered]@{
        name = $bundleFile.Name
        length = $lease.Length
        sha256 = $fileSha256
        lease = $lease
      })
      [void]$manifestBuilder.Append($bundleFile.Name)
      [void]$manifestBuilder.Append("`t")
      [void]$manifestBuilder.Append($lease.Length.ToString([Globalization.CultureInfo]::InvariantCulture))
      [void]$manifestBuilder.Append("`t")
      [void]$manifestBuilder.Append($fileSha256)
      [void]$manifestBuilder.Append("`n")
    }
    $manifestBytes = [Text.UTF8Encoding]::new($false).GetBytes(
      $manifestBuilder.ToString()
    )
    $actualBundleSha256 = Get-Sha256Hex -Bytes $manifestBytes
    if ($actualBundleSha256 -cne $ExpectedBundleSha256.ToUpperInvariant()) {
      throw 'PsqlExecutablePath bundle does not match ExpectedPsqlBundleSha256.'
    }
    if ($KeepOpen) {
      $retainLeases = $true
    }
    return [ordered]@{
      path = $executable.path
      sha256 = $executable.sha256
      bundleDirectory = $bundleDirectory
      bundleSha256 = $actualBundleSha256
      bundleFileCount = $bundlePaths.Count
      bundleFiles = @($bundleFiles.ToArray())
      leases = $(if ($KeepOpen) { @($leases.ToArray()) } else { @() })
    }
  }
  finally {
    if (-not $retainLeases) {
      foreach ($lease in $leases) {
        $lease.Dispose()
      }
    }
  }
}

function New-TrustedPsqlExecutionSnapshot {
  param(
    [Parameter(Mandatory = $true)]$ApprovedBundle,
    [Parameter(Mandatory = $true)][string]$RunDirectory
  )

  $snapshotDirectory = Join-Path $RunDirectory 'psql-execution-snapshot'
  [IO.Directory]::CreateDirectory($snapshotDirectory) | Out-Null
  Set-OwnerOnlyEvidenceDirectoryAcl -Path $snapshotDirectory
  foreach ($bundleFile in @($ApprovedBundle.bundleFiles)) {
    $source = $bundleFile.lease
    $destinationPath = Join-Path $snapshotDirectory $bundleFile.name
    $destination = [IO.FileStream]::new(
      $destinationPath,
      [IO.FileMode]::CreateNew,
      [IO.FileAccess]::ReadWrite,
      [IO.FileShare]::None
    )
    try {
      $source.Position = 0
      $source.CopyTo($destination)
      $destination.Flush($true)
      if (
        $destination.Length -ne $bundleFile.length -or
        (Get-Sha256HexFromStream -Stream $destination) -cne $bundleFile.sha256
      ) {
        throw "Psql execution snapshot copy mismatch: $($bundleFile.name)"
      }
    }
    finally {
      $destination.Dispose()
    }
  }

  $snapshotExecutablePath = Join-Path `
    $snapshotDirectory `
    ([IO.Path]::GetFileName($ApprovedBundle.path))
  $snapshotBundle = Resolve-TrustedPsqlBundle `
    -Path $snapshotExecutablePath `
    -ExpectedExecutableSha256 $ApprovedBundle.sha256 `
    -ExpectedBundleSha256 $ApprovedBundle.bundleSha256 `
    -KeepOpen
  Set-OwnerReadExecuteSnapshotAcl -Path $snapshotDirectory
  $snapshotBundle['snapshotDirectory'] = $snapshotDirectory
  return $snapshotBundle
}

function Resolve-PreflightEvidence {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [AllowEmptyString()]
    [string[]]$OutputLines
  )

  $recordPattern = (
    '^EQUORA_V5762_PREFLIGHT_EVIDENCE ' +
    'trades_count=([0-9]+) batches_count=([0-9]+) ' +
    'apply_required=(true|false)$'
  )
  $completionPattern = (
    '^v57\.62\.0 trade-import preflight PASS; ' +
    'apply_required= (true|false)$'
  )
  $recordMatches = @()
  $completionMatches = @()
  foreach ($line in @($OutputLines)) {
    $recordMatch = [regex]::Match(
      "$line",
      $recordPattern,
      [Text.RegularExpressions.RegexOptions]::CultureInvariant
    )
    if ($recordMatch.Success) {
      $recordMatches += $recordMatch
    }
    $completionMatch = [regex]::Match(
      "$line",
      $completionPattern,
      [Text.RegularExpressions.RegexOptions]::CultureInvariant
    )
    if ($completionMatch.Success) {
      $completionMatches += $completionMatch
    }
  }

  $errors = @()
  $tradesCount = $null
  $batchesCount = $null
  $applyRequired = $null
  if ($recordMatches.Count -ne 1) {
    $errors += 'Expected exactly one machine-readable preflight evidence record.'
  }
  else {
    [long]$parsedTradesCount = 0
    [long]$parsedBatchesCount = 0
    $tradesCountValid = [long]::TryParse(
      $recordMatches[0].Groups[1].Value,
      [Globalization.NumberStyles]::None,
      [Globalization.CultureInfo]::InvariantCulture,
      [ref]$parsedTradesCount
    )
    $batchesCountValid = [long]::TryParse(
      $recordMatches[0].Groups[2].Value,
      [Globalization.NumberStyles]::None,
      [Globalization.CultureInfo]::InvariantCulture,
      [ref]$parsedBatchesCount
    )
    if (-not $tradesCountValid -or $parsedTradesCount -lt 0) {
      $errors += 'Preflight trades count is not a non-negative Int64.'
    }
    else {
      $tradesCount = $parsedTradesCount
    }
    if (-not $batchesCountValid -or $parsedBatchesCount -lt 0) {
      $errors += 'Preflight batches count is not a non-negative Int64.'
    }
    else {
      $batchesCount = $parsedBatchesCount
    }
    $applyRequired = $recordMatches[0].Groups[3].Value -ceq 'true'
  }

  if ($completionMatches.Count -ne 1) {
    $errors += 'Expected exactly one preflight PASS completion record.'
  }
  elseif (
    $null -ne $applyRequired -and
    (($completionMatches[0].Groups[1].Value -ceq 'true') -ne $applyRequired)
  ) {
    $errors += 'Preflight apply_required records disagree.'
  }

  return [pscustomobject][ordered]@{
    valid = $errors.Count -eq 0
    applyRequired = $applyRequired
    tradesCount = $tradesCount
    batchesCount = $batchesCount
    errors = @($errors)
  }
}

if (-not (Test-Path -LiteralPath $script:ManifestPath -PathType Leaf)) {
  throw "Production SQL manifest is missing: $script:ManifestPath"
}

$manifest = Get-Content -LiteralPath $script:ManifestPath -Raw | ConvertFrom-Json
$manifestEntries = @($manifest.files)
if ($manifest.schema -ne 'equora-v57.62.0-production-sql-manifest-v1') {
  throw 'Production SQL manifest schema is not recognized.'
}
if ($manifest.fileCount -ne 7 -or $manifestEntries.Count -ne 7) {
  throw 'Production SQL manifest must bind exactly seven files.'
}
if ($manifest.sourceCommit -cne $script:RequiredSourceCommit) {
  throw 'Production SQL manifest sourceCommit does not match the reviewed source.'
}
if ($manifest.sourceTree -cne $script:RequiredSourceTree) {
  throw 'Production SQL manifest sourceTree does not match the reviewed source.'
}
if ($manifest.algorithm -cne $script:RequiredManifestAlgorithm) {
  throw 'Production SQL manifest algorithm does not match the reviewed algorithm.'
}
$manifestPaths = @($manifestEntries | ForEach-Object { $_.path } | Sort-Object)
$requiredManifestPaths = @($script:RequiredSqlPaths | Sort-Object)
if (
  [string]::Join('|', $manifestPaths) -cne
  [string]::Join('|', $requiredManifestPaths)
) {
  throw 'Production SQL manifest does not bind the exact reviewed seven-file set.'
}

$seenPaths = @{}
$verifiedFiles = @()
$verifiedSqlBytes = @{}
$manifestTrimCharacters = [char[]]@(
  [IO.Path]::DirectorySeparatorChar,
  [IO.Path]::AltDirectorySeparatorChar
)
$manifestRepositoryPrefix = (
  $script:RepositoryRoot.TrimEnd($manifestTrimCharacters) +
  [IO.Path]::DirectorySeparatorChar
)
foreach ($entry in $manifestEntries) {
  if ($seenPaths.ContainsKey($entry.path)) {
    throw "Duplicate production SQL manifest path: $($entry.path)"
  }
  $seenPaths[$entry.path] = $true

  $candidatePath = [IO.Path]::GetFullPath((Join-Path $script:RepositoryRoot $entry.path))
  if (
    -not $candidatePath.StartsWith(
      $manifestRepositoryPrefix,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Production SQL manifest path escapes the repository: $($entry.path)"
  }
  if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
    throw "Production SQL file is missing: $($entry.path)"
  }

  $normalizedBytes = Get-CrlfNormalizedBytes `
    -Bytes ([IO.File]::ReadAllBytes($candidatePath))
  $actualSha256 = Get-Sha256Hex -Bytes $normalizedBytes
  if ($actualSha256 -cne $entry.sha256 -or $normalizedBytes.Length -ne $entry.normalizedBytes) {
    throw "Production SQL manifest mismatch: $($entry.path)"
  }

  $verifiedFiles += [ordered]@{
    path = $entry.path
    normalizedBytes = $normalizedBytes.Length
    sha256 = $actualSha256
  }
  $verifiedSqlBytes[$entry.path] = [byte[]]$normalizedBytes.Clone()
}

$preflightExecutionBytes = Get-PreflightExecutionBytes `
  -PreflightBytes $verifiedSqlBytes[$script:PreflightRelativePath] `
  -VerifierBytes $verifiedSqlBytes['supabase/verify-v57.62.0-trade-import.sql']
$preflightExecutionSha256 = Get-Sha256Hex -Bytes $preflightExecutionBytes

$currentHead = Invoke-GitText -Arguments @('rev-parse', 'HEAD')
$currentBranch = Invoke-GitText -Arguments @('branch', '--show-current')
$originMain = Invoke-GitText -Arguments @('rev-parse', 'origin/main')
$worktreeStatus = Invoke-GitText -Arguments @('status', '--porcelain=v1', '--untracked-files=all')
$worktreeClean = [string]::IsNullOrWhiteSpace($worktreeStatus)
$manifestFileSha256 = Get-Sha256Hex `
  -Bytes ([IO.File]::ReadAllBytes($script:ManifestPath))
$resolvedEvidenceDirectory = $null
if (-not [string]::IsNullOrWhiteSpace($EvidenceDirectory)) {
  $resolvedEvidenceDirectory = Resolve-ExternalEvidenceDirectory `
    -Path $EvidenceDirectory
}

$localValidation = [ordered]@{
  schema = 'equora-v57.62.0-production-preflight-local-validation-v1'
  mode = $Mode
  branch = $currentBranch
  head = $currentHead
  originMain = $originMain
  worktreeClean = $worktreeClean
  sqlManifest = $script:ManifestPath
  sqlManifestSha256 = $manifestFileSha256
  sqlFileCount = $verifiedFiles.Count
  sqlFiles = $verifiedFiles
  preflightExecutionTransport = 'stdin-with-inlined-verifier'
  preflightExecutionSha256 = $preflightExecutionSha256
  preflightExecutionBytes = $preflightExecutionBytes.Length
  evidenceDirectoryValidated = $null -ne $resolvedEvidenceDirectory
  hostedSupabaseAccessed = $false
  databaseMutationAttempted = $false
}

if ($Mode -eq 'ValidateLocal') {
  $localValidation | ConvertTo-Json -Depth 6
  exit 0
}

if ([IO.Path]::DirectorySeparatorChar -ne '\') {
  throw 'ExecuteReadOnly is supported only on the reviewed Windows process-isolation profile.'
}

Assert-RequiredValue -Name 'ExpectedHead' -Value $ExpectedHead
Assert-RequiredValue -Name 'ExpectedProjectRef' -Value $ExpectedProjectRef
Assert-RequiredValue -Name 'ExpectedDatabaseHost' -Value $ExpectedDatabaseHost
Assert-RequiredValue -Name 'EvidenceDirectory' -Value $EvidenceDirectory

if ($ExpectedHead -notmatch '^[0-9a-f]{40}$') {
  throw 'ExpectedHead must be an exact lowercase 40-character Git commit ID.'
}
if ($ExpectedProjectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'ExpectedProjectRef must be an exact 20-character Supabase project ref.'
}
if ($ExpectedProjectRef -cne $script:RequiredProjectRef) {
  throw 'ExpectedProjectRef does not match the reviewed Equora Production target.'
}
if ($currentHead -cne $ExpectedHead) {
  throw "Current HEAD does not match ExpectedHead: $currentHead"
}
if (-not $worktreeClean) {
  throw 'ExecuteReadOnly requires a clean working tree, including no untracked files.'
}

$connectionUrl = [Environment]::GetEnvironmentVariable(
  'EQUORA_SUPABASE_DATABASE_URL',
  'Process'
)
if ([string]::IsNullOrWhiteSpace($connectionUrl)) {
  throw 'EQUORA_SUPABASE_DATABASE_URL is missing from the current process environment.'
}
$connectionTarget = Resolve-ProductionConnectionTarget `
  -ConnectionUrl $connectionUrl `
  -ExpectedProjectRef $ExpectedProjectRef `
  -ExpectedDatabaseHost $ExpectedDatabaseHost
$databaseHost = $connectionTarget.databaseHost
$databasePort = $connectionTarget.databasePort
$databaseName = $connectionTarget.databaseName
$databaseUser = $connectionTarget.databaseUser
$databasePassword = $connectionTarget.databasePassword
$connectionType = $connectionTarget.connectionType

$sslRootCertificateInput = [Environment]::GetEnvironmentVariable(
  'EQUORA_SUPABASE_SSL_ROOT_CERT',
  'Process'
)
if ([string]::IsNullOrWhiteSpace($sslRootCertificateInput)) {
  throw 'EQUORA_SUPABASE_SSL_ROOT_CERT is missing from the current process environment.'
}
$sslRootCertificate = Resolve-TrustedRootCertificate `
  -Path $sslRootCertificateInput `
  -ExpectedSha256 $ExpectedSslRootCertificateSha256

$psqlExecutable = Resolve-TrustedPsqlBundle `
  -Path $PsqlExecutablePath `
  -ExpectedExecutableSha256 $ExpectedPsqlSha256 `
  -ExpectedBundleSha256 $ExpectedPsqlBundleSha256 `
  -KeepOpen
$psqlExecutionSnapshot = $null
$logStream = $null
$receiptStream = $null
$certificateSnapshotStream = $null
$certificateSnapshotPath = $null
$receiptPendingPath = $null
try {
$psqlVersion = $null
$preflightEvidenceCommand = (
  '\echo EQUORA_V5762_PREFLIGHT_EVIDENCE ' +
  'trades_count=:v5762_pre_trades_count ' +
  'batches_count=:v5762_pre_batches_count ' +
  'apply_required=:v5762_apply_required'
)
$connectionDescriptor = (
  "host=$databaseHost port=$databasePort " +
  "dbname=$databaseName user=$databaseUser sslmode=verify-full connect_timeout=10 " +
  'application_name=equora_v5762_readonly_preflight'
)

if (-not (Test-Path -LiteralPath $resolvedEvidenceDirectory)) {
  New-Item -ItemType Directory -Path $resolvedEvidenceDirectory | Out-Null
}
$resolvedEvidenceDirectory = Resolve-ExternalEvidenceDirectory `
  -Path $resolvedEvidenceDirectory
$timestamp = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmsszzz').Replace(':', '')
$runId = [Guid]::NewGuid().ToString('N')
$runDirectory = Join-Path $resolvedEvidenceDirectory "v5762-production-preflight-$timestamp-$runId"
[IO.Directory]::CreateDirectory($runDirectory) | Out-Null
Set-OwnerOnlyEvidenceDirectoryAcl -Path $runDirectory
$runDirectory = Resolve-ExternalEvidenceDirectory -Path $runDirectory
$psqlExecutionSnapshot = [ordered]@{
  snapshotDirectory = Join-Path $runDirectory 'psql-execution-snapshot'
  leases = @()
}
$psqlExecutionSnapshot = New-TrustedPsqlExecutionSnapshot `
  -ApprovedBundle $psqlExecutable `
  -RunDirectory $runDirectory
$logPath = Join-Path $runDirectory 'preflight.log'
$receiptPath = Join-Path $runDirectory 'receipt.json'
$receiptPendingPath = Join-Path $runDirectory 'receipt.pending'
$certificateSnapshotPath = Join-Path $runDirectory 'root-certificate.snapshot'
$logStream = [IO.FileStream]::new(
  $logPath,
  [IO.FileMode]::CreateNew,
  [IO.FileAccess]::ReadWrite,
  [IO.FileShare]::Read
)
$certificateSnapshotStream = [IO.FileStream]::new(
  $certificateSnapshotPath,
  [IO.FileMode]::CreateNew,
  [IO.FileAccess]::ReadWrite,
  [IO.FileShare]::Read
)
$certificateSnapshotStream.Write(
  $sslRootCertificate.bytes,
  0,
  $sslRootCertificate.bytes.Length
)
$certificateSnapshotStream.Flush($true)

$startedAt = [DateTimeOffset]::Now
$outputLines = @()
$evidenceOutputLines = @()
$exitCode = -1
$psqlTimedOut = $false
$nativeProcessFailed = $false
$nativeProcessFailureReason = $null
$processTreeBoundary = $null
$processCleanupVerified = $false
$sensitiveOutputValues = @(
  $databasePassword,
  $connectionUrl,
  $sslRootCertificateInput,
  $sslRootCertificate.path,
  $certificateSnapshotPath
)

try {
  $psqlResult = Invoke-NativeProcess `
    -ExecutablePath $psqlExecutionSnapshot.path `
    -Arguments @(
      '-X',
      '--no-psqlrc',
      '-v', 'ON_ERROR_STOP=1',
      '-d', $connectionDescriptor,
      '-f', '-',
      '-c', $preflightEvidenceCommand
    ) `
    -TimeoutSeconds $PsqlTimeoutSeconds `
    -UseKillOnCloseJob $true `
    -StandardInputBytes $preflightExecutionBytes `
    -EnvironmentVariables @{
      PGPASSWORD = $databasePassword
      PGOPTIONS = (
        '-c default_transaction_read_only=on ' +
        '-c statement_timeout=45000 ' +
        '-c idle_in_transaction_session_timeout=60000'
      )
      PGAPPNAME = 'equora_v5762_readonly_preflight'
      PGSSLROOTCERT = $certificateSnapshotPath
      PATH = (
        $psqlExecutionSnapshot.bundleDirectory + [IO.Path]::PathSeparator +
        [Environment]::SystemDirectory + [IO.Path]::PathSeparator +
        [Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)
      )
    }
  $outputLines = @(Protect-PreflightOutputLines `
    -Lines $psqlResult.outputLines `
    -SensitiveValues $sensitiveOutputValues)
  $evidenceOutputLines = @($psqlResult.stdoutLines)
  $exitCode = $psqlResult.exitCode
  $psqlTimedOut = $psqlResult.timedOut
  $processTreeBoundary = $psqlResult.processTreeBoundary
  $processCleanupVerified = $psqlResult.cleanupVerified
}
catch {
  $nativeProcessFailed = $true
  $exitCode = -3
  $psqlTimedOut = $false
  $nativeProcessFailureReason = @(Protect-PreflightOutputLines `
    -Lines @($_.Exception.Message) `
    -SensitiveValues $sensitiveOutputValues)[0]
  $outputLines = @("EQUORA_NATIVE_PROCESS_FAILURE: $nativeProcessFailureReason")
  $evidenceOutputLines = @()
}
finally {
  if ($null -ne $certificateSnapshotStream) {
    $certificateSnapshotStream.Dispose()
    $certificateSnapshotStream = $null
  }
  foreach ($psqlLease in @($psqlExecutable.leases)) {
    $psqlLease.Dispose()
  }
  $psqlExecutable.leases = @()
  if (Test-Path -LiteralPath $certificateSnapshotPath -PathType Leaf) {
    Remove-Item -LiteralPath $certificateSnapshotPath -Force
  }
  $databasePassword = $null
  $connectionUrl = $null
  $sslRootCertificateInput = $null
  $sensitiveOutputValues = @()
}

$utf8NoBom = [Text.UTF8Encoding]::new($false)
$logBytes = $utf8NoBom.GetBytes((@($outputLines) -join [Environment]::NewLine) + [Environment]::NewLine)
$logStream.Write($logBytes, 0, $logBytes.Length)
$logStream.Flush($true)
$logStream.Dispose()
$logStream = $null
$preflightEvidence = Resolve-PreflightEvidence -OutputLines $evidenceOutputLines
$preflightPassed = (
  -not $psqlTimedOut -and
  $exitCode -eq 0 -and
  $preflightEvidence.valid
)
$completedAt = [DateTimeOffset]::Now
$logSha256 = Get-Sha256Hex -Bytes $logBytes
$receipt = [ordered]@{
  schema = 'equora-v57.62.0-production-preflight-receipt-v5'
  startedAt = $startedAt.ToString('o')
  completedAt = $completedAt.ToString('o')
  mode = 'ExecuteReadOnly'
  expectedProjectRef = $ExpectedProjectRef
  expectedDatabaseHost = $ExpectedDatabaseHost
  connectionType = $connectionType
  databaseHost = $databaseHost
  databasePort = $databasePort
  databaseName = $databaseName
  databaseUser = $databaseUser
  expectedHead = $ExpectedHead
  actualHead = $currentHead
  branch = $currentBranch
  worktreeClean = $worktreeClean
  sqlManifestSha256 = $manifestFileSha256
  sqlFileCount = $verifiedFiles.Count
  sslMode = 'verify-full'
  expectedSslRootCertificateSha256 = $sslRootCertificate.expectedSha256
  sslRootCertificateSha256 = $sslRootCertificate.sha256
  psqlPath = $psqlExecutionSnapshot.path
  psqlApprovedSourcePath = $psqlExecutable.path
  psqlExecutedSnapshotPath = $psqlExecutionSnapshot.path
  psqlExecutedSnapshotRelativePath = (
    'psql-execution-snapshot/' + [IO.Path]::GetFileName($psqlExecutionSnapshot.path)
  )
  psqlSha256 = $psqlExecutable.sha256
  psqlBundleSha256 = $psqlExecutable.bundleSha256
  psqlBundleFileCount = $psqlExecutable.bundleFileCount
  psqlVersion = $psqlVersion
  psqlVersionProbeAttempted = $false
  psqlBinding = 'sha256-readonly-execution-snapshot-v3'
  psqlDependencySetBound = $true
  psqlExecutionSnapshotWriteDeniedAtLaunch = $true
  psqlExecutionSnapshotSameIdentityAdversaryExcluded = $true
  sqlTransport = 'stdin'
  executedSqlPath = $null
  executedSqlSha256 = $preflightExecutionSha256
  executedSqlBytes = $preflightExecutionBytes.Length
  forcedDefaultTransactionReadOnly = $true
  psqlTimeoutSeconds = $PsqlTimeoutSeconds
  psqlExitCode = $exitCode
  psqlTimedOut = $psqlTimedOut
  nativeProcessFailed = $nativeProcessFailed
  nativeProcessFailureReason = $nativeProcessFailureReason
  processTreeBoundary = $processTreeBoundary
  processCleanupVerified = $processCleanupVerified
  preflightEvidenceValid = $preflightEvidence.valid
  preflightApplyRequired = $preflightEvidence.applyRequired
  preflightTradesCount = $preflightEvidence.tradesCount
  preflightBatchesCount = $preflightEvidence.batchesCount
  preflightEvidenceErrors = @($preflightEvidence.errors)
  preflightPassed = $preflightPassed
  logFile = [IO.Path]::GetFileName($logPath)
  logBytes = $logBytes.Length
  logSha256 = $logSha256
  deploymentAttempted = $false
  activationAttempted = $false
  receiptComplete = $true
}
$receiptBytes = $utf8NoBom.GetBytes(($receipt | ConvertTo-Json -Depth 6) + "`n")
$receiptStream = [IO.FileStream]::new(
  $receiptPendingPath,
  [IO.FileMode]::CreateNew,
  [IO.FileAccess]::ReadWrite,
  [IO.FileShare]::None
)
try {
  $receiptStream.Write($receiptBytes, 0, $receiptBytes.Length)
  $receiptStream.Flush($true)
}
finally {
  $receiptStream.Dispose()
  $receiptStream = $null
}
[IO.File]::Move($receiptPendingPath, $receiptPath)

if (-not $preflightPassed) {
  throw "Production preflight failed. Review evidence outside the repository: $receiptPath"
}

$receipt | ConvertTo-Json -Depth 6
}
finally {
  foreach ($stream in @($certificateSnapshotStream, $logStream, $receiptStream)) {
    if ($null -ne $stream) {
      try { $stream.Dispose() } catch { }
    }
  }
  foreach ($psqlLease in @($psqlExecutable.leases)) {
    try { $psqlLease.Dispose() } catch { }
  }
  $psqlExecutable.leases = @()
  if ($null -ne $psqlExecutionSnapshot) {
    foreach ($psqlLease in @($psqlExecutionSnapshot.leases)) {
      try { $psqlLease.Dispose() } catch { }
    }
    $psqlExecutionSnapshot.leases = @()
    if (
      -not [string]::IsNullOrWhiteSpace($psqlExecutionSnapshot.snapshotDirectory) -and
      (Test-Path -LiteralPath $psqlExecutionSnapshot.snapshotDirectory -PathType Container)
    ) {
      Remove-OwnerProtectedSnapshotDirectory `
        -Path $psqlExecutionSnapshot.snapshotDirectory
    }
  }
  if (
    -not [string]::IsNullOrWhiteSpace($certificateSnapshotPath) -and
    (Test-Path -LiteralPath $certificateSnapshotPath -PathType Leaf)
  ) {
    Remove-Item -LiteralPath $certificateSnapshotPath -Force -ErrorAction SilentlyContinue
  }
  $databasePassword = $null
  $connectionUrl = $null
  $sslRootCertificateInput = $null
  $sensitiveOutputValues = @()
}
