import getAccountById from "../util/getAccountById.js";
import getProductById from "../util/getProductById.js";
import getTradeById from "../util/getTradeById.js";

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
  async productDetails(parent, args, context, info) {
    let { product } = await getProductById(context, parent.productId);
    console.log("product in product details is ", product);

    return { product: product };
  },
};
