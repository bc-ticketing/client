/* 
  This file contains a data class for the user and helper functions to get specific information from it and to load tickets for the user from the blockchain.
*/
import {
  MintFungibles,
  MintNonFungibles,
  ticketTransferred,
  getJoinedPresales,
  getTicketClaimed,
  getTicketPriceRefunded,
} from "./blockchainEventHandler";
import { isNf, getTicketId, getTicketTypeIndex } from "idetix-utils";

const BigNumber = require("bignumber.js");

export class User {
  constructor(account, balance) {
    // hack to turn users from idb into proper user objects
    if (typeof account === "object") {
      Object.assign(this, account);
      this.account = account.account;
      this.balance = balance;
      return;
    }
    this.lastFetchedBlock = 0;
    this.fungibleTickets = [];
    this.nonFungibleTickets = [];
    this.fBuyOrders = [];
    this.nfBuyOrders = [];
    this.account = account;
    this.balance = balance;
    this.presales = {
      joined: {},
      ended: {},
    };
    this.idetixIdentity = {
      phone: false,
      mail: false,
      kyc: false,
    };
    this.approvalLevels = {};
  }
}

export function setApprovalLevel(user, approver, method) {
  user.approvalLevels[approver] = method ? method : 0;
}

export function getApprovalLevelForApprover(user, approver) {
  return user.approvalLevels[approver];
}

export function isApproved(user, approver, level) {
  return (
    user.approvalLevels[approver] &&
    user.approvalLevels[approver].level >= level
  );
}

export async function loadPresales(user, event, web3Instance, ABI) {
  await loadJoinedPresales(user, event, web3Instance, ABI);
  await loadClaimedPresales(user, event, web3Instance, ABI);
}

export async function loadJoinedPresales(user, event, web3Instance, ABI) {
  const eventSC = new web3Instance.eth.Contract(ABI, event.contractAddress);
  const presales = await getJoinedPresales(eventSC, 0, user.account);
  presales.forEach((presale) => {
    user.presales.joined[event.contractAddress] = user.presales.joined[
      event.contractAddress
    ]
      ? user.presales.joined[event.contractAddress]
      : {};
    user.presales.joined[event.contractAddress][
      presale.returnValues.ticketType
    ] = true;
  });
}

export async function loadClaimedPresales(user, event, web3Instance, ABI) {
  console.log("loading claimed presales");
  const eventSC = new web3Instance.eth.Contract(ABI, event.contractAddress);
  const claims = await getTicketClaimed(eventSC, 0, user.account);
  const refunds = await getTicketPriceRefunded(eventSC, 0, user.account);
  for (const claim of claims) {
    console.log(claim);
    user.presales.joined[event.contractAddress][
      claim.returnValues.ticketType
    ] = false;
  }
  for (const refund of refunds) {
    console.log(refund);
    user.presales.joined[event.contractAddress][
      refund.returnValues.ticketType
    ] = false;
  }
}

export function getNumberFungibleOwned(user, event, type) {
  let amount = 0;
  for (const t of user.fungibleTickets) {
    if (t.eventContractAddress === event && t.ticketType === type) {
      amount += Number(t.amount);
    }
  }
  return amount;
}

export async function checkFungibleTicketPurchases(user, contract) {
  const fungibles = await MintFungibles(
    contract,
    user.lastFetchedBlock + 1,
    user.account
  );
  return fungibles;
}
export async function checkNonFungibleTicketPurchases(user, contract) {
  const nonFungibles = await MintNonFungibles(
    contract,
    user.lastFetchedBlock + 1,
    user.account
  );
  return nonFungibles;
}

export async function checkTicketChanges(user, contract) {
  const seller = await ticketTransferred(
    contract,
    user.lastFetchedBlock + 1,
    "seller",
    user.account
  );
  seller.map((t) => {
    t.changeType = "sold";
  });
  const buyer = await ticketTransferred(
    contract,
    user.lastFetchedBlock + 1,
    "buyer",
    user.account
  );
  buyer.map((t) => {
    t.changeType = "bought";
  });
  return seller.concat(buyer);
}

export function loadAftermarketForEvent(user, event) {
  for (const ticket of user.fungibleTickets) {
    console.log("loading am for ticket: ", ticket);
    if (ticket.eventContractAddress === event.contractAddress) {
      const sellOrders = event.getSellOrdersByAddress(
        user.account,
        ticket.ticketType,
        false
      );
      console.log("got sell orders", sellOrders);
      ticket.sellOrders = sellOrders;
    }
  }
  for (const ticket of user.nonFungibleTickets) {
    if (ticket.eventContractAddress === event.contractAddress) {
      const sellOrder = event.getSellOrdersByAddress(
        user.account,
        ticket.ticketType,
        ticket.ticketId
      );
      ticket.sellOrder = sellOrder;
    }
  }
  user.fBuyOrders = user.fBuyOrders.concat(
    event.getBuyOrdersByAddress(user.account, false)
  );
  user.nfBuyOrders = user.nfBuyOrders.concat(
    event.getBuyOrdersByAddress(user.account, true)
  );
}

async function handleMintFungible(user, eventContractAddress, events) {
  for (const purchase of events) {
    const ticketType = Number(
      getTicketTypeIndex(
        new BigNumber(purchase.returnValues.ticketType)
      ).toFixed()
    );
    const quantity = purchase.returnValues.quantity;
    let t = user.fungibleTickets.find(
      (t) =>
        t.ticketType === ticketType &&
        t.eventContractAddress === eventContractAddress
    );
    if (t) {
      t.amount += Number(quantity);
      console.log(user.fungibleTickets);
    } else {
      user.fungibleTickets.push({
        ticketType: ticketType,
        amount: Number(quantity),
        eventContractAddress: eventContractAddress,
      });
    }
    console.log(user.fungibleTickets);
  }
}

async function handleMintNonFungible(user, eventContractAddress, events) {
  for (const purchase of events) {
    const ids = purchase.returnValues.ids;
    for (const id of ids) {
      const ticketType = Number(
        getTicketTypeIndex(new BigNumber(id)).toFixed()
      );
      const ticketId = Number(getTicketId(new BigNumber(id)).toFixed());
      user.nonFungibleTickets.push({
        ticketId: ticketId,
        ticketType: ticketType,
        eventContractAddress: eventContractAddress,
      });
    }
  }
}

async function handleTicketTransferred(user, eventContractAddress, transfers) {
  for (const change of transfers) {
    const isNfTicketType = isNf(new BigNumber(change.returnValues.id));
    const ticketTypeId = Number(
      getTicketTypeIndex(new BigNumber(change.returnValues.id)).toFixed()
    );
    if (!isNfTicketType) {
      // search for the ticket type in the inventory of the user
      let ticketInInventory = user.fungibleTickets.find(
        (t) =>
          t.ticketType === ticketTypeId &&
          t.eventContractAddress === eventContractAddress
      );
      if (change.changeType === "sold") {
        if (ticketInInventory) {
          ticketInInventory.amount -= 1;
        }
      } else {
        if (ticketInInventory) {
          ticketInInventory.amount += 1;
        } else {
          user.fungibleTickets.push({
            ticketType: ticketTypeId,
            amount: 1,
            eventContractAddress: eventContractAddress,
          });
        }
      }
    } else {
      const ticketId = Number(
        getTicketId(new BigNumber(change.returnValues.id)).toFixed()
      );
      let ticketInInventory = user.nonFungibleTickets.find((t) => {
        t.ticketType === ticketTypeId;
      });
      if (change.changeType === "sold") {
        console.log("sold nf ticket: " + ticketTypeId + " - " + ticketId);
        if (ticketInInventory) {
          user.nonFungibleTickets.filter((t) => {
            t.ticketType === ticketTypeId && t.ticketId === ticketId;
          });
        }
        console.log("nf tickets: ", user.nonFungibleTickets);
      } else {
        console.log("bought nf ticket: " + ticketTypeId + " - " + ticketId);
        user.nonFungibleTickets.push({
          ticketType: ticketTypeId,
          ticketId: ticketId,
          eventContractAddress: eventContractAddress,
        });
        console.log("nf tickets: ", user.nonFungibleTickets);
      }
    }
  }
}

export async function loadTicketsForEvent(user, web3Instance, ABI, event) {
  const eventSC = new web3Instance.eth.Contract(ABI, event.contractAddress);
  const fungiblePurchases = await checkFungibleTicketPurchases(user, eventSC);
  const nonFungiblePurchases = await checkNonFungibleTicketPurchases(
    user,
    eventSC
  );
  /* Purchases from Host directly */
  handleMintFungible(user, event.contractAddress, fungiblePurchases);
  handleMintNonFungible(user, event.contractAddress, nonFungiblePurchases);
  /* Changes in ownership involving the current user */
  const transfers = await checkTicketChanges(user, eventSC);
  handleTicketTransferred(user, event.contractAddress, transfers);
}

export function ownsFungibles(user, eventContract, ticketType, amount) {
  return (
    user.fungibleTickets.filter(
      (t) =>
        t.ticketType === ticketType &&
        t.amount >= amount &&
        t.eventContractAddress == eventContract
    ).length > 0
  );
}

export function ownsNonFungible(user, eventContract, ticketType, ticketNr) {
  return user.nonFungibleTickets.find(
    (t) =>
      t.ticketType === ticketType &&
      t.ticketId === ticketNr &&
      t.eventContractAddress === eventContract
  );
}

export async function requestIdentification(user) {
  console.log(user);
}

export async function verify(user, payload) {
  if (payload.method === "mail") {
    user.addMailVerification(payload.mail);
  } else if (payload.method === "phone") {
    user.addPhoneVerification(payload.phone);
  } else {
    user.addPhoneVerification(payload.files);
  }
}

export function addPhoneVerification(user, phone) {
  console.log(phone);
}

export function addMailVerification(user, mail) {
  console.log(mail);
}

export function addKYCVerification(user, files) {
  console.log(files);
}
