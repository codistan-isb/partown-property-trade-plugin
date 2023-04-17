export default {
  notifications: {
    subscribe: function subscribe(parent, args, context, info) {
      console.log("notifications subscription function");
      let { userId } = args;
      let { pubSub } = context;

      console.log("pubsub is ", pubSub);

      return pubSub.asyncIterator(`notifications-${userId}`);
    },
  },
};
