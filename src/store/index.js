import Vue from "vue";
import Vuex from "vuex";
import state from "./state";
import { getWeb3, updateWeb3 } from "../util/getWeb3";
import { EVENT_FACTORY_ABI } from "./../util/abi/eventFactory";
import { EVENT_FACTORY_ADDRESS } from "./../util/constants/addresses";
import { EVENT_MINTABLE_AFTERMARKET_ABI } from "./../util/abi/eventMintableAftermarket";
import { argsToCid, fungibleBaseId } from "idetix-utils";
import getIpfs from "./../util/ipfs/getIpfs";

Vue.use(Vuex);

export default new Vuex.Store({
  state,
  mutations: {
    updateWeb3(state, web3) {
      console.log("Updating store with new version of web3");
      state.web3.web3Instance = web3.web3Instance;
      state.web3.account = web3.account;
      state.web3.networkId = web3.networkId;
      state.web3.balance = parseInt(web3.balance, 10);
      state.web3.isInjected = true;
    },
    setEventFactory(state, factory) {
      console.log("setting event factory");
      state.eventFactory = factory;
    },
    setEventAddresses(state, addresses) {
      console.log("setting event addresses");
      state.eventAddresses = addresses;
    },
    setEvents(state, events) {
      console.log("setting events");
      state.events = events;
    },
    registerIpfsInstance(state, payload) {
      console.log("setting ipfs instance");
      state.ipfsInstance = payload;
    },
    addEventMetadata(state, event) {
      console.log("setting event metadata");
      console.log(event);
      console.log(state.events);
      state.events[event.contractAddress].metadata = event.metadata;
    },
    setTickets(state, tickets) {
      console.log("Setting event tickets");
      for (var address in tickets) {
        state.events[address].tickets = tickets[address];
      }
    },
  },
  /* */
  actions: {
    async loadIpfsMetadata({ commit }) {
      console.log("dispatched loadIpfsMetadata Action");
      for (const contract_address in state.events) {
        const e = state.events[contract_address];
        console.log(e.ipfs_hash);
        try {
          var ipfsData = null;
          for await (const chunk of state.ipfsInstance.cat(e.ipfs_hash, {
            timeout: 2000,
          })) {
            ipfsData = Buffer(chunk, "utf8").toString();
          }
          var temp = {
            ipfsHash: e.ipfs_hash,
            contractAddress: contract_address,
            metadata: JSON.parse(ipfsData),
          };
          commit("addEventMetadata", temp);
        } catch (error) {
          if (error.name == "TimeoutError") {
            console.log("timeout while fetching ipfs metadata");
          }
        }
      }
    },
    async registerIpfs({ commit }) {
      console.log("dispatched registerIpfs Action");
      const ipfs = await getIpfs();
      commit("registerIpfsInstance", ipfs);
    },
    registerWeb3: async function({ commit }) {
      console.log("dispatched registerWeb3 Action");
      const web3 = await getWeb3();
      commit("updateWeb3", web3);
    },
    /* pulls the current web3 object and updates the store with it */
    async updateWeb3({ commit }) {
      console.log("dispatched updateWeb3 Action");
      const web3 = await updateWeb3();
      commit("updateWeb3", web3);
    },
    async fetchEventAddresses({ commit }) {
      console.log("fetching event addresses");
      commit();
      // TODO
    },
    async createEventFactory({ commit }) {
      console.log("dispatched createEventFactory Action");
      const eventFactory = new state.web3.web3Instance.eth.Contract(
        EVENT_FACTORY_ABI,
        EVENT_FACTORY_ADDRESS
      );
      commit("setEventFactory", eventFactory);
    },
    async loadEventAddresses({ commit }) {
      console.log("dispatched loadEventAddresses Action");
      const eventAddresses = await state.eventFactory.methods
        .getEvents()
        .call();
      commit("setEventAddresses", eventAddresses);
    },
    async loadEvents({ commit }) {
      console.log("dispatched loadEvents Action");
      var ipfs_hashes = {};
      for (let i = 0; i < state.eventAddresses.length; i++) {
        var a = state.eventAddresses[i];
        try {
          const eventSC = new state.web3.web3Instance.eth.Contract(
            EVENT_MINTABLE_AFTERMARKET_ABI,
            a
          );
          const eventMetadata = await eventSC.getPastEvents("EventMetadata", {
            fromBlock: 1,
          });
          var metadataObject = eventMetadata[0].returnValues;
          ipfs_hashes[a] = {
            ipfs_hash: argsToCid(
              metadataObject.hashFunction,
              metadataObject.size,
              metadataObject.digest
            ),
          };
        } catch {
          console.log("could not get metadata for event");
        }
      }
      commit("setEvents", ipfs_hashes);
    },
    async loadTickets({ commit }) {
      console.log("dispatched loadTickets Action");
      var ticket_types = {};
      // loop over all events
      for (let i = 0; i < state.eventAddresses.length; i++) {
        var a = state.eventAddresses[i];
        ticket_types[a] = [];
        try {
          const eventSC = new state.web3.web3Instance.eth.Contract(
            EVENT_MINTABLE_AFTERMARKET_ABI,
            a
          );
          const nonce = await eventSC.methods.fNonce().call();
          // nonce shows how many ticket types exist for this event
          if (nonce > 0) {
            for (let i = 0; i < nonce; i++) {
              const ticketMapping = await eventSC.methods
                .ticketTypeMeta(fungibleBaseId.plus(i))
                .call();
              ticketMapping.ticketTypeNr = i;
              ticket_types[a].push(ticketMapping);
            }
          }

          //var metadataObject = eventMetadata[0].returnValues;
        } catch (error) {
          console.log("could not get tickets for event");
          console.log(error);
        }
      }
      commit("setTickets", ticket_types);
    },
  },
  modules: {},
});
