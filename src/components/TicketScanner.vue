<template>
  <div class="overlay" v-bind:class="{ open: open }">
    <v-touch v-on:swipedown="$emit('close')" class="close-bar">
      <div class="close-icon" @click="$emit('close')">
        <md-icon>close</md-icon>
      </div>
    </v-touch>
    <div class="scanner">
      <qrcode-capture @decode="onDecode"></qrcode-capture>
    </div>
    <div class="result" v-if="result">
      <p>You have to sign the following message in order to entry:</p>
      <div class="info">message: {{ result.randId }}</div>
      <md-button class="md-raised md-primary" @click="signMessage()">
        sign
      </md-button>
    </div>
    <div class="result" v-if="response">{{ response }}</div>
  </div>
</template>

<script>
import { QrcodeCapture } from "vue-qrcode-reader";
import axios from "axios";

export default {
  name: "TicketScanner",
  components: {
    QrcodeCapture,
  },
  data() {
    return {
      result: undefined,
      response: undefined,
    };
  },
  props: {
    ticketId: Number,
    ticketTypeId: Number,
    eventContractAddress: String,
    isNf: Boolean,
    open: Boolean,
  },
  beforeCreate: function() {},
  mounted: function() {},
  computed: {
    resultProps() {
      return Object.keys(this.result);
    },
    event() {
      if (!this.eventContractAddress) return undefined;
      return this.$store.state.events.find(
        (e) => e.contractAddress === this.eventContractAddress
      );
    },
    eventTitle() {
      return this.event ? this.event.title : "";
    },
    eventDate() {
      return this.event ? this.event.getTimeAndDate() : "";
    },
    ticket() {
      return this.event
        ? this.event.getNfTicket(this.ticketTypeId, this.ticketId)
        : undefined;
    },
    ticketType() {
      return this.event
        ? this.event.getTicketType(this.ticketTypeId, this.isNf)
        : undefined;
    },
    ticketTitle() {
      return this.ticketType ? this.ticketType.title : "";
    },
    ticketDescription() {
      return this.ticketType ? this.ticketType.description : "";
    },
    amountOwned() {
      if (this.ticketType) {
        if (this.isNf) {
          return 1;
        } else {
          return this.$store.state.activeUser.getNumberFungibleOwned(
            this.eventContractAddress,
            this.ticketTypeId
          );
        }
      } else {
        return 0;
      }
    },
  },
  methods: {
    close: function() {
      this.$emit("close");
    },
    onDecode(result) {
      this.result = JSON.parse(result);
    },
    async signMessage() {
      const signedMessage = await this.$store.state.web3.web3Instance.eth.personal.sign(
        this.result.randId,
        this.$store.state.activeUser.account
      );
      console.info(signedMessage);
      let response;
      console.log(
        this.result.url,
        this.result.randId,
        signedMessage,
        this.$store.state.activeUser.account
      );
      try {
        response = await axios.post(
          `${this.result.url}/verifyOwnershipOfTicket?RandId=${
            this.result.randId
          }&numberOfGuest=${1}&signature=${signedMessage}&ethAddress=${
            this.$store.state.activeUser.account
          }`
        );
        console.log(response);
        this.response = response;
        if (response.data) {
          this.$emit("close");
          this.$root.$emit("openMessageBus", {
            message: "Ticket scanned successfully, enjoy the event!",
            status: "success",
          });
        }
      } catch (e) {
        console.log(e);
        console.log("api call error");
      }
    },
  },
};
</script>

<style scoped>
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  height: var(--vh);
  width: var(--vw);
  transform: translateY(100%);
  transition: 0.4s transform ease-in-out;
  background: white;

  overflow-y: scroll;
}
.scanner {
  padding: 2rem;
}
.result {
  padding: 2rem;
}

.overlay.open {
  transform: translateY(0);
}

.close-bar {
  width: 100%;
  background: white;
  box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2),
    0 8px 10px 1px rgba(0, 0, 0, 0.14), 0 3px 14px 2px rgba(0, 0, 0, 0.12);
  padding: 1rem;
  display: flex;
  justify-content: end;
  position: sticky;
  top: 0;
  opacity: 0;
  transition: opacity 1s ease-in-out;
}
.overlay.open .close-bar {
  opacity: 1;
}
.close-bar .md-icon {
  margin: 0;
  cursor: pointer;
}
</style>
