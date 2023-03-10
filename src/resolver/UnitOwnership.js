import getAccountById from "../utils/getAccountById.js";
import getTradeById from "../utils/getTradeById.js";

export default {
  async ownerInfo(parent, args, context, info) {
    console.log("owner Info resolver function");
    console.log("parent", parent);
    let owner = await getAccountById(context, parent.ownerId);
    console.log("owner firstName is ", owner.profile.firstName);
    return owner;
  },
  async tradeInfo(parent, args, context, info) {
    let trade = await getTradeById(context, parent.tradeId);
    return trade;
  },
};
