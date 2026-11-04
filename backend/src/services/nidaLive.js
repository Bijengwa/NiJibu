// REAL NIDA check (NIDA_MODE=live). NOT CONNECTED YET.
//
// NIDA has no open public API. Access comes from NIDA directly (an approved agreement) or from a vendor that is
// already approved (for example SelcomID or Smile ID). When you have access, fill in the function below.
// Nothing else changes: the routes, the fee, the 2 hits per try and the apps stay the same.
//
// Until then use NIDA_MODE=manual (production default): the fundi sends the NIDA number + selfie + ID photo and an
// admin decides in the admin portal.
const { NidaError } = require('./nida');

// ONE call to NIDA. `question_id` is dob | fatherMiddle | motherMiddle and `answer` is what the worker typed
// (dob as DD/MM/YYYY). Return:
//   { nida_ok, name_ok, phone_ok, answer_ok, record_number }
// nida_ok=false when the number is not found. record_number = the number NIDA has for this person.
async function check({ nida_number, first_name, middle_name, last_name, phone, question_id, answer }) { // eslint-disable-line no-unused-vars
  throw new NidaError(501, 'NOT_BUILT');
}

module.exports = { check };
