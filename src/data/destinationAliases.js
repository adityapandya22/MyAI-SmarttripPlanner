/**
 * India Destination Aliases Map.
 * Maps state/UT id to city names, popular regions, and colloquial aliases.
 * Shared across client (Trie autocomplete, search filtering) and server (destination matcher).
 */

export const ALIASES = {
  'himachal-pradesh': [
    'himachal', 'hp', 'shimla', 'manali', 'dharamshala', 'kullu',
    'spiti', 'kasol', 'dalhousie', 'old manali', 'new manali', 'mcleod ganj',
  ],
  goa: ['goa', 'panaji', 'panjim', 'baga', 'calangute', 'palolem', 'anjuna', 'old goa'],
  'jammu-and-kashmir': ['kashmir', 'srinagar', 'gulmarg', 'pahalgam', 'jammu', 'sonamarg'],
  ladakh: ['ladakh', 'leh', 'pangong', 'nubra', 'leh ladakh', 'zanskar'],
  'uttar-pradesh': ['varanasi', 'benares', 'agra', 'lucknow', 'mathura', 'vrindavan', 'allahabad', 'prayagraj', 'ayodhya'],
  rajasthan: ['jaipur', 'udaipur', 'jodhpur', 'jaisalmer', 'pushkar', 'ajmer', 'bikaner', 'mount abu'],
  kerala: ['kerala', 'kochi', 'munnar', 'alleppey', 'alappuzha', 'kovalam', 'varkala', 'wayanad', 'thrissur', 'kozhikode'],
  karnataka: ['bangalore', 'bengaluru', 'mysore', 'mysuru', 'hampi', 'coorg', 'gokarna', 'mangalore', 'chikmagalur'],
  'tamil-nadu': ['chennai', 'madurai', 'ooty', 'kodaikanal', 'mahabalipuram', 'rameswaram', 'thanjavur', 'coimbatore'],
  maharashtra: ['mumbai', 'pune', 'nashik', 'aurangabad', 'lonavala', 'mahabaleshwar', 'bombay', 'alibaug'],
  gujarat: ['ahmedabad', 'surat', 'gandhinagar', 'vadodara', 'somnath', 'dwarka', 'rann', 'kutch', 'gir'],
  'west-bengal': ['kolkata', 'calcutta', 'darjeeling', 'siliguri', 'sundarbans', 'kalimpong'],
  assam: ['guwahati', 'kaziranga', 'majuli', 'dispur', 'manas'],
  meghalaya: ['shillong', 'cherrapunji', 'mawlynnong', 'dawki'],
  'arunachal-pradesh': ['tawang', 'itanagar', 'ziro'],
  sikkim: ['gangtok', 'pelling', 'lachung', 'tsomgo', 'yumthang'],
  uttarakhand: ['dehradun', 'rishikesh', 'haridwar', 'nainital', 'mussoorie', 'kedarnath', 'badrinath', 'corbett', 'auli'],
  'madhya-pradesh': ['bhopal', 'khajuraho', 'kanha', 'bandhavgarh', 'orchha', 'ujjain', 'gwalior'],
  telangana: ['hyderabad', 'secunderabad', 'charminar', 'warangal'],
  'andhra-pradesh': ['tirupati', 'visakhapatnam', 'vizag', 'vijayawada', 'amaravati', 'aruku'],
  delhi: ['delhi', 'new delhi', 'ndls', 'connaught place', 'chandni chowk'],
  punjab: ['amritsar', 'ludhiana', 'chandigarh', 'patiala', 'golden temple'],
  'andaman-and-nicobar-islands': ['andaman', 'port blair', 'havelock', 'neil island', 'radhanagar'],
  puducherry: ['pondicherry', 'puducherry', 'auroville'],
  odisha: ['bhubaneswar', 'puri', 'konark', 'cuttack'],
  bihar: ['patna', 'bodh gaya', 'nalanda', 'rajgir'],
  jharkhand: ['ranchi', 'jamshedpur', 'deoghar'],
  manipur: ['imphal', 'loktak'],
  nagaland: ['kohima', 'dimapur'],
  tripura: ['agartala'],
  mizoram: ['aizawl'],
  chandigarh: ['chandigarh'],
  haryana: ['gurugram', 'gurgaon', 'faridabad', 'panipat'],
}
