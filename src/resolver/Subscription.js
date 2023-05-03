import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";

export default {
  notifications: {
    subscribe: function subscribe(parent, args, context, info) {
      console.log("notifications subscription function");
      let { accountId } = args;
      let { pubSub } = context;
      let decodedId = decodeOpaqueId(accountId).id
      console.log("pubsub is ", accountId);

      return pubSub.asyncIterator(`notifications-${decodedId}`);
    },
  },
};
