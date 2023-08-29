import ObjectID from "mongodb";

export default async function calculateSellerEscrowDeduction(
  collections,
  sellerId,
  tradeId,
  tradePrice
) {
  const { Accounts, Trades } = collections;

  const trade = await Trades.findOne({
    _id: ObjectID.ObjectId(tradeId),
  });

  console.log("trade in seller escrow", trade);

  const sellerFeeForCurrentTradeValue =
    tradePrice * (trade.sellerFee.percentage / 100);

  const { result } = await Accounts.updateOne(
    {
      _id: sellerId,
    },
    { $inc: { "wallets.escrow": -sellerFeeForCurrentTradeValue } }
  );

  console.log("sellerFeeForCurrentTradeValue", sellerFeeForCurrentTradeValue);

  const { result: tradeUpdateResult } = await Trades.updateOne(
    {
      _id: ObjectID.ObjectId(tradeId),
    },

    { $inc: { "sellerFee.fee": -sellerFeeForCurrentTradeValue } }
  );
  return result?.n > 0 && tradeUpdateResult?.n > 0;
}
