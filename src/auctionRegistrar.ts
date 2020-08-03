// Import types and APIs from graph-ts
import {
  Address,
  BigInt,
  Bytes,
  ByteArray,
  crypto,
  EthereumValue
} from '@graphprotocol/graph-ts'

// Import event types from the registry contract ABI
import {
  AuctionRegistrar,
  AuctionStarted,
  NewBid,
  BidRevealed,
  HashRegistered,
  HashReleased,
  HashInvalidated
} from './types/AuctionRegistrar/AuctionRegistrar'

import {
  OwnerChanged,
  DeedClosed
} from './types/Deed/Deed'

// Import entity types generated from the GraphQL schema
import { Account, AuctionedName, Deed } from './types/schema'

var rootNode:ByteArray = byteArrayFromHex("93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae")

export function auctionStarted(event: AuctionStarted): void {
  let name = new AuctionedName(event.params.hash.toHex())

  name.registrationDate = event.params.registrationDate
  name.bidCount = 0
  name.state = "AUCTION"
  name.save()
}

export function bidRevealed(event: BidRevealed): void {
  if(event.params.status == 5) {
    // Actually a cancelled bid; hash is not the label hash
    return
  }

  let name = AuctionedName.load(event.params.hash.toHex())
  switch(event.params.status) {
    case 0: // Harmless invalid bid
    case 1: // Bid revealed late
      break;
    case 4: // Bid lower than second bid
      name.bidCount += 1
      break;
    case 2: // New winning bid
      let account = new Account(event.params.owner.toHex())
      account.save()

      let registrar = AuctionRegistrar.bind(event.address)
      let deedAddress = registrar.call('entries', [EthereumValue.fromFixedBytes(event.params.hash)])[1].toAddress().toHex()

      if(name.deed != null) {
        let oldDeed = Deed.load(name.deed)
        name.secondBid = oldDeed.value
      }

      let deed = new Deed(deedAddress)
      deed.value = event.params.value
      deed.owner = event.params.owner.toHex()
      deed.save()

      name.deed = deed.id
      name.bidCount += 1
      break;
    case 3: // Runner up bid
      name.secondBid = event.params.value
      name.bidCount += 1
      break;
  }
  name.save()
}

export function hashRegistered(event: HashRegistered): void {
  let name = AuctionedName.load(event.params.hash.toHex())
  name.registrationDate = event.params.registrationDate
  name.domain = crypto.keccak256(concat(rootNode, event.params.hash)).toHex();
  name.state = "FINALIZED"
  name.save()

  let deed = Deed.load(name.deed)
  deed.value = event.params.value
  deed.save()
}

export function hashReleased(event: HashReleased): void {
  let name = new AuctionedName(event.params.hash.toHex())
  name.releaseDate = event.block.timestamp
  name.state = "RELEASED"
  name.save()
}

export function hashInvalidated(event: HashInvalidated): void {
  let name = new AuctionedName(event.params.hash.toHex())
  name.state = "FORBIDDEN"
  name.save()
}

export function deedTransferred(event: OwnerChanged): void {
  let deed = Deed.load(event.address.toHex())
  if(deed != null) {
    deed.owner = event.params.newOwner.toHex()
    deed.save()
  }
}

export function deedClosed(event: DeedClosed): void {
  let deed = Deed.load(event.address.toHex())
  if(deed != null) {
    deed.owner = null;
    deed.value = BigInt.fromI32(0);
    deed.save();
  }
}

// Helper for concatenating two byte arrays
function concat(a: ByteArray, b: ByteArray): ByteArray {
  let out = new Uint8Array(a.length + b.length)
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i]
  }
  for (let j = 0; j < b.length; j++) {
    out[a.length + j] = b[j]
  }
  return out as ByteArray
}

function byteArrayFromHex(s: string): ByteArray {
  if(s.length % 2 !== 0) {
    throw new TypeError("Hex string must have an even number of characters")
  }
  let out = new Uint8Array(s.length / 2)
  for(var i = 0; i < s.length; i += 2) {
    out[i / 2] = parseInt(s.substring(i, i + 2), 16) as u32
  }
  return out as ByteArray;
}
