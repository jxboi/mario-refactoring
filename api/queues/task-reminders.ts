import {deliverReminder} from "../_reminderDelivery.ts";
import {createQueueClient} from "../_queueClient.ts";

interface QueueMessage{reminderId:string}
const queue=createQueueClient();
export default queue.handleNodeCallback<QueueMessage>(async message=>{await deliverReminder(message.reminderId)},{retry:(_error,metadata)=>({afterSeconds:Math.min(300,2**metadata.deliveryCount*5)})});
