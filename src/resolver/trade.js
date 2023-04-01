import getAccountById from "../util/getAccountById.js";
import getProductById from "../util/getProductById.js";
import getTradeById from "../util/getTradeById.js";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
export default {
  async createdByInfo(parent, args, context, info) {
    let createByDetails = await getAccountById(
      context,
      decodeOpaqueId(parent.createdBy).id
    );
    console.log("createByDetails firstName is ", createByDetails);
    return createByDetails;
  },
  async productDetails(parent, args, context, info) {
    let { product } = await getProductById(context, parent.productId);
    return { product };
  },
};
