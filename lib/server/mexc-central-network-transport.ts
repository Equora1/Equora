import 'server-only'

/*
 * The product-facing module exposes only the fully bound BrokerNetworkTransportPort.
 * Its prepared-request signer is module-private inside mexc-transport and accepts
 * traffic only after CentralBrokerEgress has issued a single-use authorization.
 */
export { mexcBrokerNetworkTransport } from '@/lib/server/mexc-transport'
