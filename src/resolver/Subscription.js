export default {
  notifications: {
    subscribe: function subscribe(parent, args, context, info) {
      console.log("notifications subscription function");
      let { accountId } = args;
      let { pubSub } = context;

      console.log("pubsub is ", accountId);

      return pubSub.asyncIterator(`notifications-${accountId}`);
    },
  },
};
