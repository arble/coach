module.exports = {
  THREAD_STATUS: {
    OPEN: 1,
    CLOSED: 2,
    SUSPENDED: 3
  },

  THREAD_MESSAGE_TYPE: {
    SYSTEM: 1,
    CHAT: 2,
    FROM_USER: 3,
    TO_USER: 4,
    LEGACY: 5,
    COMMAND: 6
  },

  THREAD_GATHER_INFO: {
    INCOMPLETE: 0,
    CHOICE:     1,
    RANK:       2,
    PLATFORM:   3,
    REQUEST:    4,
    REPLAY:     5,
    COMPLETE:   99
  },

  ACCIDENTAL_THREAD_MESSAGES: [
    'ok',
    'okay',
    'thanks',
    'ty',
    'k',
    'kk',
    'thank you',
    'thanx',
    'thnx',
    'thx',
    'tnx',
    'ok thank you',
    'ok thanks',
    'ok ty',
    'ok thanx',
    'ok thnx',
    'ok thx',
    'ok no problem',
    'ok np',
    'okay thank you',
    'okay thanks',
    'okay ty',
    'okay thanx',
    'okay thnx',
    'okay thx',
    'okay no problem',
    'okay np',
    'okey thank you',
    'okey thanks',
    'okey ty',
    'okey thanx',
    'okey thnx',
    'okey thx',
    'okey no problem',
    'okey np',
    'cheers'
  ],
};
