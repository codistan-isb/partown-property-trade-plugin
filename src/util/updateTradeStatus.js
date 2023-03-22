import ObjectID from "mongodb";
export default async function updateTradeStatus(
  collections,
  tradeId,
  tradeStatus
) {
  const { Trades } = collections;
  let { result } = await Trades.updateOne(
    { _id: ObjectID.ObjectId(tradeId) },
    { $set: { tradeStatus: tradeStatus } }
  );
  return result?.n > 0;
}
