// One plain answer to "did this request go through?"
//   successful        the job was done and the customer paid
//   awaiting_payment  the job is done, the customer has not paid yet
//   active            still going (searching, on the way, working)
//   failed            it did not happen: cancelled, or nobody was found
// `reason` says why it failed, in one short line.
function outcomeOf({ status, cancelled_by, cancel_reason, payment_status }) {
  if (status === 'completed') {
    return payment_status === 'paid' ? { outcome: 'successful', reason: null } : { outcome: 'awaiting_payment', reason: null };
  }
  if (status === 'no_provider') return { outcome: 'failed', reason: 'No provider was found' };
  if (status === 'cancelled') {
    const who = cancelled_by === 'customer' ? 'Customer cancelled' : cancelled_by === 'provider' ? 'Worker cancelled' : 'Cancelled by system';
    return { outcome: 'failed', reason: cancel_reason ? `${who}: ${cancel_reason}` : who };
  }
  return { outcome: 'active', reason: null };
}

const OUTCOMES = ['successful', 'awaiting_payment', 'active', 'failed'];

module.exports = { outcomeOf, OUTCOMES };
