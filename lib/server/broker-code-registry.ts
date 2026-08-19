import 'server-only'

import type {
  BrokerCodeRegistryPort,
  ProviderCapabilityRef,
} from '@/lib/server/broker-core-contracts'
import {
  MEXC_READONLY_CAPABILITIES,
  mexcReadonlyAdapter,
} from '@/lib/server/providers/mexc-readonly-adapter'

function sameProviderCapability(left: ProviderCapabilityRef, right: ProviderCapabilityRef) {
  return left.providerCode === right.providerCode
    && left.providerContractVersion === right.providerContractVersion
    && left.adapterVersion === right.adapterVersion
    && left.capabilityKind === right.capabilityKind
    && left.providerCapabilityId === right.providerCapabilityId
    && left.providerCapabilityVersion === right.providerCapabilityVersion
    && left.capabilityDescriptorDigest === right.capabilityDescriptorDigest
}

function readDescriptor(ref: ProviderCapabilityRef) {
  return MEXC_READONLY_CAPABILITIES.find((descriptor) => sameProviderCapability(descriptor.ref, ref)) ?? null
}

export const brokerCodeRegistry: BrokerCodeRegistryPort = Object.freeze({
  async readBuiltCapability(ref: ProviderCapabilityRef) {
    return readDescriptor(ref)
  },
  async readBuiltAdapter(ref: ProviderCapabilityRef) {
    return readDescriptor(ref) === null ? null : mexcReadonlyAdapter
  },
})
