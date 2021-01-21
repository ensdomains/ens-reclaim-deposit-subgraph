// Import types and APIs from graph-ts
import {
  Address,
  BigInt,
  Bytes,
  ByteArray,
  crypto,
  log
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
} from '../generated/AuctionRegistrar/AuctionRegistrar'

import {
  OwnerChanged,
  DeedClosed
} from '../generated/Deed/Deed'

// Import entity types generated from the GraphQL schema
import { Account, AuctionedName, Deed, StatsEntity } from '../generated/schema'

var rootNode:ByteArray = byteArrayFromHex("93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae")

function loadStats(): StatsEntity {
  let stats = StatsEntity.load('')
  if(!stats){
    stats = new StatsEntity('')
    stats.numOfDeeds = 0
    stats.numAuctioned = 0
    stats.numFinalised = 0
    stats.numReleased = 0
    stats.numTransferred = 0
    stats.numClosed = 0
    stats.numForbidden = 0
    stats.accumValue = BigInt.fromI32(0)
    stats.currentValue = BigInt.fromI32(0)
  }
  return stats as StatsEntity
}

export function auctionStarted(event: AuctionStarted): void {
  let name = new AuctionedName(event.params.hash.toHexString())
  let stats = loadStats()
  stats.numAuctioned = stats.numAuctioned + 1
  stats.save()
  name.registrationDate = event.params.registrationDate
  name.bidCount = 0
  name.state = "AUCTION"
  name.save()
}

export function bidRevealed(event: BidRevealed): void {
  log.warning(
    '*** bidRevealed 1 Block number: {}, block hash: {}, transaction hash: {}, address: {}',
    [
      event.block.number.toString(),       // "47596000"
      event.block.hash.toHexString(),      // "0x..."
      event.transaction.hash.toHexString(), // "0x..."
      event.address.toHex()
    ]
  );

  if(event.params.status == 5) {
    // Actually a cancelled bid; hash is not the label hash
    return
  }
  let name = AuctionedName.load(event.params.hash.toHexString())
  switch(event.params.status) {
    case 0: // Harmless invalid bid
    case 1: // Bid revealed late
      break;
    case 4: // Bid lower than second bid
      name.bidCount += 1
      break;
    case 2: // New winning bid
      let account = new Account(event.params.owner.toHexString())
      account.save()

      let registrar = AuctionRegistrar.bind(event.address)
      let deedAddress = registrar.entries(event.params.hash).value1.toHexString()

      if(name.deed != null) {
        let oldDeed = Deed.load(name.deed)
        name.secondBid = oldDeed.value
      }

      let deed = new Deed(deedAddress)
      deed.value = event.params.value
      deed.owner = event.params.owner.toHexString()
      deed.save()

      name.deed = deed.id
      name.bidCount += 1

      let stats = loadStats()
      stats.numOfDeeds = stats.numOfDeeds + 1
      stats.accumValue = stats.accumValue.plus(event.params.value)
      stats.currentValue = stats.currentValue.plus(event.params.value)
      stats.save()
      break;
    case 3: // Runner up bid
      name.secondBid = event.params.value
      name.bidCount += 1
      break;
  }
  name.save()
}

export function hashRegistered(event: HashRegistered): void {
  log.warning(
    '*** hashRegistered 1 Block number: {}, block hash: {}, transaction hash: {}, address: {}',
    [
      event.block.number.toString(),       // "47596000"
      event.block.hash.toHexString(),      // "0x..."
      event.transaction.hash.toHexString(), // "0x...",
      event.address.toHex()
    ]
  );
  let name = AuctionedName.load(event.params.hash.toHexString())
  name.registrationDate = event.params.registrationDate
  name.domain = crypto.keccak256(concat(rootNode, event.params.hash)).toHexString();
  name.state = "FINALIZED"
  name.save()
  let deed = Deed.load(name.deed)
  let diff = deed.value.minus(event.params.value)
  deed.value = event.params.value
  deed.save()
  let stats = loadStats()
  stats.numFinalised = stats.numFinalised + 1
  stats.currentValue = stats.currentValue.minus(diff)
  stats.save()
}

export function hashReleased(event: HashReleased): void {
  let name = new AuctionedName(event.params.hash.toHexString())
  name.releaseDate = event.block.timestamp
  name.state = "RELEASED"
  name.save()
  let stats = loadStats()
  stats.numReleased = stats.numReleased + 1
  stats.save()
}

export function hashInvalidated(event: HashInvalidated): void {
  let name = new AuctionedName(event.params.hash.toHexString())
  name.state = "FORBIDDEN"
  name.save()
  let stats = loadStats()
  stats.numForbidden = stats.numForbidden + 1
  stats.save()
}

export function deedTransferred(event: OwnerChanged): void {
  log.warning(
    '*** deedTransferred 1 Block number: {}, block hash: {}, transaction hash: {}',
    [
      event.block.number.toString(),       // "47596000"
      event.block.hash.toHexString(),      // "0x..."
      event.transaction.hash.toHexString() // "0x..."
    ]
  );
  log.warning('***deedTransferred 2 address {}', [
    event.address.toHex()
  ])
  log.warning('***deedTransferred 3 newOwner {}', [
    event.params.newOwner.toHex(),
  ])

  let deed = Deed.load(event.address.toHex())
  log.warning('***deedTransferred 4', [])
  if(deed != null) {
    log.warning('***deedTransferred 5 oldOwner {}', [
      deed.owner
    ])
    deed.owner = event.params.newOwner.toHex()
    deed.save()
    let stats = loadStats()
    stats.numTransferred = stats.numTransferred + 1
    stats.save()
  }else{
    log.warning('***deedTransferred 6', [])  
  }
}

export function deedClosed(event: DeedClosed): void {
  log.warning(
    '*** deedClosed 1 Block number: {}, block hash: {}, transaction hash: {}, address: {}',
    [
      event.block.number.toString(),       // "47596000"
      event.block.hash.toHexString(),      // "0x..."
      event.transaction.hash.toHexString(), // "0x...",
      event.address.toHex()
    ]
  );
  let deed = Deed.load(event.address.toHex())
  log.warning('***deedClosed 2 deed {}', [deed.id])
  if(deed != null) {
    log.warning('***deedClosed 3', [])
    let stats = loadStats()
    stats.numOfDeeds = stats.numOfDeeds - 1
    stats.currentValue = stats.currentValue.minus(deed.value)
    stats.save()

    deed.owner = null;
    deed.value = BigInt.fromI32(0);
    deed.save();
  }else{
    log.warning('***deedClosed 4', [])
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
