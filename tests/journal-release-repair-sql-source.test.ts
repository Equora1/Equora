// Source contract only: no PostgreSQL execution, ACL or concurrency runtime claim.
import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {scanSqlInstallStatements} from './helpers/sql-install-lexical'
const sql=readFileSync('supabase/schema-patch-v57.62.0-journal-repair-v3.sql','utf8').replaceAll('\r\n','\n')
const old=readFileSync('supabase/schema-patch-v57.62.0-review-snapshot-v2.sql','utf8').replaceAll('\r\n','\n')
describe('local SQL candidate source boundaries',()=>{
 it('keeps the exact reviewed v2 snapshot fence and grant contract with explicit v3 names',()=>{
  const start='create or replace function public.equora_review_source_v2'
  const expected=old.slice(old.indexOf(start)).replaceAll('equora_review_source_v2','equora_review_source_v3').replaceAll('equora_commit_review_snapshot_v2','equora_commit_review_snapshot_v3').replaceAll('review-source-v2','review-source-v3').replaceAll('documented-outcomes-v2','finalized-outcomes-v3')
  expect(sql.slice(sql.indexOf('create or replace function public.equora_review_source_v3'))).toBe(expected)
 })
 it('has no historical data backfill or old function replacement',()=>{
  expect(sql).toContain('add column exit_price_basis text')
  expect(sql).not.toMatch(/update public\.review_sessions/i)
  expect(sql).not.toMatch(/create(?: or replace)? function public\.equora_(?:create|update)_trade_v1/i)
  expect(sql).toContain('UNSAFE_REVIEW_INSERT_GRANT');expect(sql).toContain('UNSAFE_REVIEW_METRIC_UPDATE_GRANT')
 })
 it('clears stale semantics only when prices or partial legs actually change',()=>{
  expect(sql).toContain('before update of exit,partial_exits on public.trades')
  expect(sql).toContain('new.exit is distinct from old.exit or new.partial_exits is distinct from old.partial_exits')
  expect(sql).toContain('new.exit_price_basis:=null')
 })
 it('binds the new wrappers to the authenticated owner and existing atomic writer',()=>{
  expect(sql.match(/owner_id uuid:=auth.uid\(\)/g)).toHaveLength(2)
  expect(sql).toContain('where id=p_trade_id and user_id=owner_id for update')
  expect(sql).toContain("if coalesce((result->>'alreadyApplied')::boolean,false) then return result")
  expect(sql).toContain('basis:=public.equora_assert_exit_price_basis_v1(p_trade)')
  expect(sql).toContain('JOURNAL_REPAIR_CONTRACT_ALREADY_PRESENT_REQUIRES_DRIFT_REVIEW')
 })
})

describe('entire SQL installation lexical boundary, not database execution',()=>{
 it('scans the entire transaction including the previously missed grant preflight',()=>{
  const statements=scanSqlInstallStatements(sql)
  expect(statements[0].toLowerCase()).toBe('begin');expect(statements.at(-1)!.toLowerCase()).toBe('commit')
  expect(statements.filter(s=>/^create (or replace )?function /i.test(s))).toHaveLength(6)
  const marker='-- Existing metadata-only UPDATE grants',start=old.indexOf(marker),end=old.indexOf('create or replace function public.equora_review_source_v2')
  const original=old.slice(start,end).trim()
  expect(sql).toContain(original)
  expect(statements.some(s=>/^do\s+\$\$declare principal text/.test(s))).toBe(true)
 })
 it('rejects the exact lost-dollar installation counterexample',()=>{
  const damaged=sql.replace('do $$declare principal text',()=> 'do $declare principal text')
  expect(damaged).not.toBe(sql);expect(()=>scanSqlInstallStatements(damaged)).toThrow()
 })
 it('rejects an unmatched body even when individual grant words are present',()=>{
  expect(()=>scanSqlInstallStatements("begin; do $body$ begin perform 1; end; commit;")).toThrow('SQL_DOLLAR_BODY_UNCLOSED')
 })
})
