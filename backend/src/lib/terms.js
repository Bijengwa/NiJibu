// Terms and Conditions. ONE source for both apps (they fetch it from GET /api/auth/terms).
// Change the text and bump VERSION: everybody is asked to agree again the next time they open the app.
// DRAFT: have a lawyer read it before you go live, and fill in the contact line.
const VERSION = '2026-10-31';

const en = {
  title: 'Terms and Conditions',
  sections: [
    { h: 'About NiJibu', p: 'NiJibu is an app that helps customers find home service workers (fundis) near them. NiJibu does not employ the workers. Each worker works for himself or herself.' },
    { h: 'Your account', p: 'You must be 18 or older. Give true details. Keep your password secret. One person, one account. You are responsible for what is done with your account.' },
    { h: 'Customers', p: 'Agree the price with the worker before the work starts. When the work is finished, confirm it and pay inside the app. Do not pay outside the app.' },
    { h: 'Workers', p: 'To work as a worker you must pass an identity check with your NIDA details. The registration fee (1,000 TSh) is paid before each identity check. It is not refunded, even if the check fails, and you pay again to try again. Do the job you agreed, at the price you entered, and be on time.' },
    { h: 'Payments and commission', p: 'The customer pays in the app by mobile money. NiJibu keeps 13% as its commission and sends the other 87% to the worker\'s mobile money number. The lowest price for a job is TZS 10,000: the app does not accept a lower price.' },
    { h: 'Complaints', p: 'A customer or a worker can complain within 7 days of the job. While a complaint about money is being checked, the payment can be held. NiJibu looks at each complaint and can warn, suspend or remove an account.' },
    { h: 'Rules', p: 'No fraud, no false identity, no harassment, no illegal work, no sharing of accounts and no taking customers away from the app to avoid the commission. NiJibu can suspend or close an account that breaks these rules.' },
    { h: 'Your data', p: 'We keep your phone number, name, email, photo, your location while you use the app and, for workers, your NIDA details (the NIDA number is stored encrypted). We use them to run the service, to check identity, to keep people safe and to handle payments. We do not sell your data. You can delete your account in the app. We follow the Personal Data Protection Act, 2022 of Tanzania.' },
    { h: 'Changes', p: 'We can change these terms. When we do, we will ask you to agree again before you continue.' },
    { h: 'Contact', p: 'Questions? Contact NiJibu support through the app.' },
  ],
};

const sw = {
  title: 'Masharti na Vigezo',
  sections: [
    { h: 'Kuhusu NiJibu', p: 'NiJibu ni programu inayowasaidia wateja kupata mafundi wa huduma za nyumbani walio karibu nao. NiJibu haiwaajiri mafundi. Kila fundi anafanya kazi kwa niaba yake mwenyewe.' },
    { h: 'Akaunti yako', p: 'Lazima uwe na miaka 18 au zaidi. Toa taarifa za kweli. Linda nenosiri lako. Mtu mmoja, akaunti moja. Unawajibika kwa kinachofanywa kwa akaunti yako.' },
    { h: 'Wateja', p: 'Kubaliana bei na fundi kabla kazi haijaanza. Kazi ikiisha, ithibitishe na ulipe ndani ya programu. Usilipe nje ya programu.' },
    { h: 'Mafundi', p: 'Ili kufanya kazi kama fundi lazima upite uhakiki wa utambulisho kwa taarifa zako za NIDA. Ada ya usajili (TSh 1,000) inalipwa kabla ya kila uhakiki wa utambulisho. Hairudishwi, hata uhakiki ukishindwa, na unalipa tena ili ujaribu tena. Fanya kazi uliyokubaliana, kwa bei uliyoweka, na ufike kwa wakati.' },
    { h: 'Malipo na kamisheni', p: 'Mteja analipa ndani ya programu kwa pesa mtandaoni. NiJibu inabaki na asilimia 13 kama kamisheni na inamtumia fundi asilimia 87 iliyobaki kwenye namba yake ya malipo. Bei ya chini kabisa ya kazi ni TSh 10,000: programu haikubali bei ndogo kuliko hiyo.' },
    { h: 'Malalamiko', p: 'Mteja au fundi anaweza kulalamika ndani ya siku 7 tangu kazi. Malalamiko kuhusu pesa yakiwa yanakaguliwa, malipo yanaweza kusimamishwa. NiJibu inapitia kila malalamiko na inaweza kuonya, kusimamisha au kuondoa akaunti.' },
    { h: 'Kanuni', p: 'Hakuna ulaghai, hakuna utambulisho wa uongo, hakuna unyanyasaji, hakuna kazi haramu, hakuna kushiriki akaunti na hakuna kuwatoa wateja nje ya programu ili kukwepa kamisheni. NiJibu inaweza kusimamisha au kufunga akaunti inayovunja kanuni hizi.' },
    { h: 'Taarifa zako', p: 'Tunatunza namba yako ya simu, jina, barua pepe, picha, mahali ulipo unapotumia programu na, kwa mafundi, taarifa zako za NIDA (namba ya NIDA inahifadhiwa kwa usiri wa kisiri). Tunazitumia kuendesha huduma, kuhakiki utambulisho, kuweka watu salama na kushughulikia malipo. Hatuuzi taarifa zako. Unaweza kufuta akaunti yako ndani ya programu. Tunafuata Sheria ya Ulinzi wa Taarifa Binafsi ya mwaka 2022 ya Tanzania.' },
    { h: 'Mabadiliko', p: 'Tunaweza kubadilisha masharti haya. Tukifanya hivyo, tutakuomba ukubali tena kabla ya kuendelea.' },
    { h: 'Mawasiliano', p: 'Una swali? Wasiliana na msaada wa NiJibu kupitia programu.' },
  ],
};

module.exports = { VERSION, TERMS: { en, sw } };
