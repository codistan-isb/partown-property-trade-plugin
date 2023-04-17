export default async function markAsRead(context, args) {
  const { collections } = context;
  const { Notifications } = collections;
  const { notificationId } = args;
  console.log("update for ", notificationId);
  let Notifications_update = await Notifications.updateOne(
    { _id: notificationId },
    {
      $set: {
        status: "read",
      },
    }
  );
  if (Notifications_update.modifiedCount) {
    let nptif_res = await Notifications.findOne({ _id: notificationId });
    console.log(nptif_res);
    return nptif_res;
  } else {
    throw new Error("Something went wrong");
  }
}
