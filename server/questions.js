'use strict';
/**
 * Question bank for Merge Mystery: The Missing Festival.
 *
 * All items are original, written for Primary 4-6 EFL pupils in Thailand.
 * Ordering runs easy -> a little difficult via the `difficulty` field (1-5).
 * One shared bank serves every grade; the teacher controls pacing, not the
 * pupil's merge skill.
 *
 * Record shape
 * ------------
 *   id               unique stable string
 *   topic            greetings | feelings | introductions | requests
 *                    | routines | food | hobbies | conversation
 *   difficulty       1 (easiest recognition) .. 5 (short reading and writing)
 *   type             mc | order | blank | reading | writing
 *   prompt           the question the pupil reads
 *   passage          optional 2-4 line conversation shown above the prompt
 *   options          MC/reading choices (exactly one correct)
 *   tokens           `order` items: the correct sequence, shuffled for display
 *   answer           canonical correct answer
 *   accepted         extra answers marked correct (explicit, never fuzzy)
 *   acceptedPatterns `writing` items only: tight anchored regex sources that
 *                    check the sentence frame. Used so a pupil may supply their
 *                    own name or hobby without the frame being graded wrongly.
 *   explanation      short friendly feedback shown after answering
 *   example          sample answer shown for typed questions
 */

const TOPICS = [
  'greetings',
  'feelings',
  'introductions',
  'requests',
  'routines',
  'food',
  'hobbies',
  'conversation',
];

const TYPES = ['mc', 'order', 'blank', 'reading', 'writing'];

/** Shared conversations, referenced by several reading questions. */
const PASSAGES = {
  afterSchool:
    'Dao: Hi, Mali! What do you do after school?\n' +
    'Mali: I usually read books. I like stories about animals.\n' +
    'Dao: Do you like football?\n' +
    "Mali: No, I don't. I like reading more.",
  market:
    'Shopkeeper: Good afternoon! Can I help you?\n' +
    'Nin: Yes, please. I would like three apples.\n' +
    'Shopkeeper: Here you are. That is thirty baht.\n' +
    'Nin: Thank you. Here is the money.',
};

const QUESTIONS = [
  // -----------------------------------------------------------------------
  // Difficulty 1 - easy recognition
  // -----------------------------------------------------------------------
  {
    id: 'g-001', topic: 'greetings', difficulty: 1, type: 'mc',
    prompt: "Your teacher says, 'Good morning!' What do you say?",
    options: ['Good morning!', 'Good night!', 'Goodbye!', 'Thank you!'],
    answer: 'Good morning!', accepted: [],
    explanation: "We answer a greeting with the same greeting. 'Good morning!' is right.",
  },
  {
    id: 'g-002', topic: 'greetings', difficulty: 1, type: 'mc',
    prompt: 'It is eight o\'clock in the morning. Which greeting is best?',
    options: ['Good morning.', 'Good evening.', 'Good night.', 'Good afternoon.'],
    answer: 'Good morning.', accepted: [],
    explanation: 'We say "Good morning" before twelve o\'clock.',
  },
  {
    id: 'g-003', topic: 'greetings', difficulty: 1, type: 'mc',
    prompt: "Someone says, 'How are you?' Which answer is correct?",
    options: ['I am fine, thank you.', 'I am seven.', 'My name is Nin.', 'It is Monday.'],
    answer: 'I am fine, thank you.', accepted: [],
    explanation: "'How are you?' asks about your feelings. We answer 'I am fine, thank you.'",
  },
  {
    id: 'g-004', topic: 'greetings', difficulty: 1, type: 'mc',
    prompt: 'You are leaving school. What do you say to your friend?',
    options: ['Goodbye! See you tomorrow.', 'Good morning!', 'Nice to meet you.', 'Here you are.'],
    answer: 'Goodbye! See you tomorrow.', accepted: [],
    explanation: 'We say "Goodbye" when we leave.',
  },
  {
    id: 'g-005', topic: 'greetings', difficulty: 1, type: 'mc',
    prompt: 'It is seven o\'clock at night. You meet your neighbour. What do you say?',
    options: ['Good evening.', 'Good morning.', 'Good afternoon.', 'Good night.'],
    answer: 'Good evening.', accepted: [],
    explanation: 'We say "Good evening" when we meet someone at night. "Good night" is for leaving or going to bed.',
  },
  {
    id: 'f-001', topic: 'feelings', difficulty: 1, type: 'mc',
    prompt: 'Mali is smiling and laughing. How does she feel?',
    options: ['happy', 'sad', 'angry', 'tired'],
    answer: 'happy', accepted: [],
    explanation: 'When we smile and laugh, we feel happy.',
  },
  {
    id: 'f-002', topic: 'feelings', difficulty: 1, type: 'mc',
    prompt: 'Nok is crying. How does he feel?',
    options: ['sad', 'happy', 'hungry', 'excited'],
    answer: 'sad', accepted: [],
    explanation: 'Crying usually shows that someone feels sad.',
  },
  {
    id: 'f-003', topic: 'feelings', difficulty: 1, type: 'mc',
    prompt: 'I did not sleep last night. I am ___.',
    options: ['tired', 'happy', 'thirsty', 'angry'],
    answer: 'tired', accepted: [],
    explanation: 'No sleep makes us tired.',
  },
  {
    id: 'f-004', topic: 'feelings', difficulty: 1, type: 'mc',
    prompt: 'It is my birthday today! I am very ___.',
    options: ['excited', 'sleepy', 'bored', 'cold'],
    answer: 'excited', accepted: [],
    explanation: 'A birthday is good news, so we feel excited.',
  },
  {
    id: 'f-005', topic: 'feelings', difficulty: 1, type: 'mc',
    prompt: 'I have a big test tomorrow. I feel ___.',
    options: ['nervous', 'hungry', 'full', 'thirsty'],
    answer: 'nervous', accepted: [],
    explanation: 'We feel nervous when something important is coming.',
  },
  {
    id: 'i-001', topic: 'introductions', difficulty: 1, type: 'mc',
    prompt: 'Which sentence tells your name?',
    options: ['My name is Mali.', 'I am ten years old.', 'I like cats.', 'How are you?'],
    answer: 'My name is Mali.', accepted: [],
    explanation: "'My name is ...' tells people your name.",
  },
  {
    id: 'i-002', topic: 'introductions', difficulty: 1, type: 'mc',
    prompt: 'A new pupil joins your class. What do you say?',
    options: ['Nice to meet you.', 'Give me that.', 'Go away.', 'I am busy.'],
    answer: 'Nice to meet you.', accepted: [],
    explanation: 'We say "Nice to meet you" when we meet someone for the first time.',
  },
  {
    id: 'i-003', topic: 'introductions', difficulty: 1, type: 'mc',
    prompt: "'How old are you?' Which answer is correct?",
    options: ['I am eleven years old.', 'I am from Thailand.', 'I am fine.', 'My name is Nin.'],
    answer: 'I am eleven years old.', accepted: [],
    explanation: "'How old are you?' asks about your age.",
  },
  {
    id: 'i-004', topic: 'introductions', difficulty: 1, type: 'mc',
    prompt: "'Where are you from?' Which answer is correct?",
    options: ['I am from Thailand.', 'I am eleven.', 'I like rice.', 'Good morning.'],
    answer: 'I am from Thailand.', accepted: [],
    explanation: "'Where are you from?' asks about your country or town.",
  },
  {
    id: 'q-001', topic: 'requests', difficulty: 1, type: 'mc',
    prompt: 'You want to borrow a pencil. Which sentence is polite?',
    options: ['May I borrow your pencil, please?', 'Give me a pencil.', 'Pencil!', 'I take your pencil.'],
    answer: 'May I borrow your pencil, please?', accepted: [],
    explanation: "'May I ... , please?' is a polite way to ask.",
  },
  {
    id: 'q-002', topic: 'requests', difficulty: 1, type: 'mc',
    prompt: 'Your friend helps you. What do you say?',
    options: ['Thank you.', 'Sorry.', 'Hello.', 'Please.'],
    answer: 'Thank you.', accepted: [],
    explanation: 'We say "Thank you" when someone helps us.',
  },
  {
    id: 'd-001', topic: 'food', difficulty: 1, type: 'mc',
    prompt: 'Which one is a fruit?',
    options: ['banana', 'rice', 'chicken', 'bread'],
    answer: 'banana', accepted: [],
    explanation: 'A banana is a fruit. Rice, chicken and bread are not fruit.',
  },
  {
    id: 'd-002', topic: 'food', difficulty: 1, type: 'mc',
    prompt: 'I am thirsty. I want some ___.',
    options: ['water', 'shoes', 'books', 'chairs'],
    answer: 'water', accepted: [],
    explanation: 'When we are thirsty we drink water.',
  },
  {
    id: 'h-001', topic: 'hobbies', difficulty: 1, type: 'mc',
    prompt: 'I like ___. I go to the pool every Saturday.',
    options: ['swimming', 'cooking', 'reading', 'singing'],
    answer: 'swimming', accepted: [],
    explanation: 'We swim in a pool, so the hobby is swimming.',
  },
  {
    id: 'r-001', topic: 'routines', difficulty: 1, type: 'mc',
    prompt: "I ___ up at six o'clock.",
    options: ['get', 'take', 'make', 'do'],
    answer: 'get', accepted: [],
    explanation: "We say 'get up' when we leave our bed in the morning.",
  },

  // -----------------------------------------------------------------------
  // Difficulty 2 - short choices and first typed words
  // -----------------------------------------------------------------------
  {
    id: 'r-002', topic: 'routines', difficulty: 2, type: 'blank',
    prompt: 'I brush my ___ every morning.',
    answer: 'teeth', accepted: ['my teeth'], example: 'teeth',
    explanation: "We brush our teeth. 'Teeth' is the plural of 'tooth'.",
  },
  {
    id: 'g-006', topic: 'greetings', difficulty: 2, type: 'blank',
    prompt: "We say 'Good ___!' when we meet someone at eight o'clock in the day.",
    answer: 'morning', accepted: [], example: 'morning',
    explanation: "Before twelve o'clock we say 'Good morning!'",
  },
  {
    id: 'i-005', topic: 'introductions', difficulty: 2, type: 'blank',
    prompt: 'My ___ is Mali.',
    answer: 'name', accepted: [], example: 'name',
    explanation: "'My name is Mali.' tells us her name.",
  },
  {
    id: 'q-003', topic: 'requests', difficulty: 2, type: 'blank',
    prompt: '___ I have some water, please?',
    answer: 'may', accepted: ['can', 'could'], example: 'may',
    explanation: "'May I', 'Can I' and 'Could I' are all polite ways to ask.",
  },
  {
    id: 'd-003', topic: 'food', difficulty: 2, type: 'mc',
    prompt: "'Would you like some juice?' Which answer is polite?",
    options: ['Yes, please.', 'No!', 'Give me juice.', 'I am juice.'],
    answer: 'Yes, please.', accepted: [],
    explanation: "We add 'please' to say yes politely.",
  },
  {
    id: 'd-004', topic: 'food', difficulty: 2, type: 'mc',
    prompt: "'Would you like some cake?' You do not want cake. Which answer is polite?",
    options: ['No, thank you.', 'No!', 'I hate cake.', 'Yes, please.'],
    answer: 'No, thank you.', accepted: [],
    explanation: "We say 'No, thank you' to refuse politely.",
  },
  {
    id: 'h-002', topic: 'hobbies', difficulty: 2, type: 'mc',
    prompt: 'My hobby is ___. I draw pictures every day.',
    options: ['drawing', 'running', 'eating', 'sleeping'],
    answer: 'drawing', accepted: [],
    explanation: 'Making pictures with a pencil is called drawing.',
  },
  {
    id: 'h-003', topic: 'hobbies', difficulty: 2, type: 'blank',
    prompt: 'I like ___ books. I read every night.',
    answer: 'reading', accepted: [], example: 'reading',
    explanation: "After 'I like' we often use a verb with -ing: 'I like reading books.'",
  },
  {
    id: 'r-003', topic: 'routines', difficulty: 2, type: 'mc',
    prompt: 'After school I ___ home.',
    options: ['go', 'goes', 'going', 'went'],
    answer: 'go', accepted: [],
    explanation: "With 'I' we use 'go', not 'goes'.",
  },
  {
    id: 'f-006', topic: 'feelings', difficulty: 2, type: 'blank',
    prompt: 'I want some food. I am ___.',
    answer: 'hungry', accepted: ['very hungry'], example: 'hungry',
    explanation: 'When we want food we are hungry.',
  },
  {
    id: 'f-007', topic: 'feelings', difficulty: 2, type: 'blank',
    prompt: 'I want some water. I am ___.',
    answer: 'thirsty', accepted: ['very thirsty'], example: 'thirsty',
    explanation: 'When we want a drink we are thirsty.',
  },
  {
    id: 'g-007', topic: 'greetings', difficulty: 2, type: 'mc',
    prompt: 'Which sentence is correct?',
    options: ['How are you today?', 'How you are today?', 'How are today you?', 'Are how you today?'],
    answer: 'How are you today?', accepted: [],
    explanation: "The question word comes first: 'How are you today?'",
  },
  {
    id: 'i-006', topic: 'introductions', difficulty: 2, type: 'mc',
    prompt: 'This is my friend. ___ name is Nok.',
    options: ['His', 'He', 'Him', 'He is'],
    answer: 'His', accepted: [],
    explanation: "Before 'name' we use 'His' or 'Her': 'His name is Nok.'",
  },
  {
    id: 'q-004', topic: 'requests', difficulty: 2, type: 'mc',
    prompt: 'You stepped on your friend\u2019s foot. What do you say?',
    options: ['I am sorry.', 'Thank you.', 'You are welcome.', 'Good night.'],
    answer: 'I am sorry.', accepted: [],
    explanation: 'We say "I am sorry" when we make a mistake.',
  },
  {
    id: 'q-005', topic: 'requests', difficulty: 2, type: 'mc',
    prompt: "Your friend says, 'Thank you.' What do you say?",
    options: ['You are welcome.', 'Please.', 'Sorry.', 'Goodbye.'],
    answer: 'You are welcome.', accepted: [],
    explanation: "We answer 'Thank you' with 'You are welcome.'",
  },
  {
    id: 'd-005', topic: 'food', difficulty: 2, type: 'blank',
    prompt: 'I eat a ___ for breakfast. It is a long yellow fruit.',
    answer: 'banana', accepted: [], example: 'banana',
    explanation: 'A banana is long and yellow.',
  },
  {
    id: 'r-004', topic: 'routines', difficulty: 2, type: 'blank',
    prompt: "I go to ___ at eight o'clock in the morning.",
    answer: 'school', accepted: ['my school'], example: 'school',
    explanation: 'Pupils go to school in the morning.',
  },
  {
    id: 'h-004', topic: 'hobbies', difficulty: 2, type: 'mc',
    prompt: 'I like playing ___ with my friends at the park.',
    options: ['football', 'a football game play', 'to football', 'footballs'],
    answer: 'football', accepted: [],
    explanation: "We say 'play football' with no 'a' and no 'to'.",
  },
  {
    id: 'g-008', topic: 'greetings', difficulty: 2, type: 'mc',
    prompt: "Someone says, 'Nice to meet you.' What is a good answer?",
    options: ['Nice to meet you, too.', 'I am fine.', 'No, thank you.', 'See you.'],
    answer: 'Nice to meet you, too.', accepted: [],
    explanation: "We add 'too' to say the same thing back.",
  },
  {
    id: 'f-008', topic: 'feelings', difficulty: 2, type: 'mc',
    prompt: 'My dog is sick. I feel ___.',
    options: ['worried', 'excited', 'funny', 'lucky'],
    answer: 'worried', accepted: [],
    explanation: 'We feel worried when someone we love is not well.',
  },

  // -----------------------------------------------------------------------
  // Difficulty 3 - sentence building and short reading
  // -----------------------------------------------------------------------
  {
    id: 'g-009', topic: 'greetings', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to make a question.',
    tokens: ['How', 'are', 'you', 'today?'],
    answer: 'How are you today?', accepted: [],
    explanation: "A question starts with the question word: 'How are you today?'",
  },
  {
    id: 'i-007', topic: 'introductions', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to tell your name.',
    tokens: ['My', 'name', 'is', 'Mali.'],
    answer: 'My name is Mali.', accepted: [],
    explanation: "The pattern is: My + name + is + your name.",
  },
  {
    id: 'q-006', topic: 'requests', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to make a polite request.',
    tokens: ['May', 'I', 'borrow', 'your', 'pencil,', 'please?'],
    answer: 'May I borrow your pencil, please?', accepted: [],
    explanation: "'May I borrow ... , please?' is a polite request.",
  },
  {
    id: 'r-005', topic: 'routines', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to talk about your morning.',
    tokens: ['I', 'get', 'up', 'at', 'six', "o'clock."],
    answer: "I get up at six o'clock.", accepted: [],
    explanation: "We use 'at' before a time: at six o'clock.",
  },
  {
    id: 'h-005', topic: 'hobbies', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to talk about a hobby.',
    tokens: ['I', 'like', 'swimming', 'in', 'the', 'river.'],
    answer: 'I like swimming in the river.', accepted: [],
    explanation: "After 'I like' we use the -ing form: 'I like swimming.'",
  },
  {
    id: 'd-006', topic: 'food', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to offer a drink.',
    tokens: ['Would', 'you', 'like', 'some', 'juice?'],
    answer: 'Would you like some juice?', accepted: [],
    explanation: "'Would you like ... ?' is a polite way to offer something.",
  },
  {
    id: 'f-009', topic: 'feelings', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to talk about your feelings.',
    tokens: ['I', 'am', 'happy', 'today.'],
    answer: 'I am happy today.', accepted: [],
    explanation: "We use 'I am' before a feeling word.",
  },
  {
    id: 'g-010', topic: 'greetings', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to greet your teacher.',
    tokens: ['Good', 'morning,', 'Miss', 'Nin.'],
    answer: 'Good morning, Miss Nin.', accepted: [],
    explanation: 'We put the name after the greeting.',
  },
  {
    id: 'r-006', topic: 'routines', difficulty: 3, type: 'blank',
    prompt: "I eat dinner ___ seven o'clock.",
    answer: 'at', accepted: [], example: 'at',
    explanation: "We use 'at' before a clock time: at seven o'clock.",
  },
  {
    id: 'r-007', topic: 'routines', difficulty: 3, type: 'blank',
    prompt: 'I go to bed ___ nine o\u2019clock every night.',
    answer: 'at', accepted: [], example: 'at',
    explanation: "Clock times use 'at': at nine o'clock.",
  },
  {
    id: 'h-006', topic: 'hobbies', difficulty: 3, type: 'blank',
    prompt: 'My favourite hobby ___ cooking.',
    answer: 'is', accepted: [], example: 'is',
    explanation: "'Hobby' is one thing, so we use 'is'.",
  },
  {
    id: 'd-007', topic: 'food', difficulty: 3, type: 'blank',
    prompt: 'A: Would you like some rice? \u00a0 B: Yes, ___.',
    answer: 'please', accepted: ['please!'], example: 'please',
    explanation: "'Yes, please.' is the polite way to accept.",
  },
  {
    id: 'c-001', topic: 'conversation', difficulty: 3, type: 'reading',
    passage:
      'Mali: Hello, Nok. How are you?\n' +
      'Nok: I am tired. I went to bed very late.\n' +
      'Mali: Oh! Go to bed early tonight.',
    prompt: 'How does Nok feel?',
    options: ['tired', 'happy', 'hungry', 'angry'],
    answer: 'tired', accepted: [],
    explanation: "Nok says 'I am tired' in line two.",
  },
  {
    id: 'c-002', topic: 'conversation', difficulty: 3, type: 'reading',
    passage:
      'Nin: Good afternoon, Miss Kim.\n' +
      'Miss Kim: Good afternoon, Nin. Are you ready?\n' +
      'Nin: Yes, I am.',
    prompt: 'What time of day is it?',
    options: ['afternoon', 'morning', 'night', 'early morning'],
    answer: 'afternoon', accepted: [],
    explanation: "They say 'Good afternoon', so it is the afternoon.",
  },
  {
    id: 'c-003', topic: 'conversation', difficulty: 3, type: 'reading',
    passage:
      'Ploy: May I borrow your ruler, please?\n' +
      'Dao: Yes, here you are.\n' +
      'Ploy: Thank you very much.',
    prompt: 'What does Ploy want?',
    options: ['a ruler', 'a pencil', 'a book', 'a ball'],
    answer: 'a ruler', accepted: [],
    explanation: 'Ploy asks to borrow a ruler.',
  },
  {
    id: 'c-004', topic: 'conversation', difficulty: 3, type: 'reading',
    passage:
      'Mum: Would you like some milk?\n' +
      'Anan: No, thank you. I would like some water, please.',
    prompt: 'What does Anan want?',
    options: ['water', 'milk', 'juice', 'tea'],
    answer: 'water', accepted: [],
    explanation: 'Anan says no to milk and asks for water.',
  },
  {
    id: 'i-008', topic: 'introductions', difficulty: 3, type: 'blank',
    prompt: 'I ___ from Thailand. I live in Chiang Mai.',
    answer: 'am', accepted: [], example: 'am',
    explanation: "With 'I' we use 'am': I am from Thailand.",
  },
  {
    id: 'r-008', topic: 'routines', difficulty: 3, type: 'mc',
    prompt: 'Which sentence talks about a daily routine?',
    options: [
      "I get up at six o'clock every day.",
      'I got up late yesterday.',
      'I will get up early tomorrow.',
      'I am getting up now.',
    ],
    answer: "I get up at six o'clock every day.", accepted: [],
    explanation: "A routine happens again and again. 'Every day' shows a routine.",
  },
  {
    id: 'h-007', topic: 'hobbies', difficulty: 3, type: 'blank',
    prompt: 'I play the guitar every evening. Music is my ___.',
    answer: 'hobby', accepted: ['favourite hobby', 'favorite hobby'], example: 'hobby',
    explanation: 'A hobby is something we enjoy doing in our free time.',
  },
  {
    id: 'd-008', topic: 'food', difficulty: 3, type: 'mc',
    prompt: 'Which food is a vegetable?',
    options: ['carrot', 'banana', 'rice', 'milk'],
    answer: 'carrot', accepted: [],
    explanation: 'A carrot is a vegetable. A banana is a fruit.',
  },
  {
    id: 'q-007', topic: 'requests', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to ask for help politely.',
    tokens: ['Could', 'you', 'help', 'me,', 'please?'],
    answer: 'Could you help me, please?', accepted: [],
    explanation: "'Could you ... , please?' is a polite request.",
  },
  {
    id: 'f-010', topic: 'feelings', difficulty: 3, type: 'order',
    prompt: 'Put the words in order to ask about a friend\u2019s feelings.',
    tokens: ['Why', 'are', 'you', 'sad?'],
    answer: 'Why are you sad?', accepted: [],
    explanation: "'Why' asks for a reason: 'Why are you sad?'",
  },

  // -----------------------------------------------------------------------
  // Difficulty 4 - longer reading and guided writing
  // -----------------------------------------------------------------------
  {
    id: 'c-005', topic: 'conversation', difficulty: 4, type: 'reading',
    passage: PASSAGES.afterSchool,
    prompt: 'What does Mali like doing after school?',
    options: ['reading books', 'playing football', 'swimming', 'cooking'],
    answer: 'reading books', accepted: [],
    explanation: "Mali says 'I usually read books.'",
  },
  {
    id: 'c-006', topic: 'conversation', difficulty: 4, type: 'reading',
    passage: PASSAGES.afterSchool,
    prompt: 'Does Mali like football?',
    options: ["No, she doesn't.", 'Yes, she does.', 'She loves it.', 'The text does not say.'],
    answer: "No, she doesn't.", accepted: [],
    explanation: "Mali says 'No, I don't' when Dao asks about football.",
  },
  {
    id: 'c-007', topic: 'conversation', difficulty: 4, type: 'reading',
    passage:
      'Nok: Good morning, Dad. I am hungry.\n' +
      'Dad: Would you like some rice and eggs?\n' +
      'Nok: Yes, please. Thank you!\n' +
      'Dad: Here you are.',
    prompt: 'What will Nok eat?',
    options: ['rice and eggs', 'bread and milk', 'fruit', 'noodles'],
    answer: 'rice and eggs', accepted: [],
    explanation: 'Dad offers rice and eggs, and Nok says "Yes, please."',
  },
  {
    id: 'w-001', topic: 'greetings', difficulty: 4, type: 'writing',
    prompt: "Your friend says: 'How are you?' Write your answer. Use: I am ___, thank you.",
    answer: 'I am fine, thank you.',
    accepted: [
      'i am fine thank you', 'i am well thank you', 'i am good thank you',
      'i am ok thank you', 'i am okay thank you', 'i am happy thank you',
      'i am very well thank you', 'i am fine thanks', 'i am fine thank you very much',
    ],
    acceptedPatterns: ['^i am (very )?(fine|well|good|ok|okay|great|happy) thank you( very much)?$'],
    example: 'I am fine, thank you.',
    explanation: "A good answer is 'I am fine, thank you.' Any feeling word works, but keep 'thank you' to be polite.",
  },
  {
    id: 'w-002', topic: 'introductions', difficulty: 4, type: 'writing',
    prompt: 'Write a sentence that tells your name. Use: My name is ___.',
    answer: 'My name is Mali.',
    accepted: [],
    // The frame is graded, not the name. Letters, spaces, hyphens and
    // apostrophes only, so any real name is accepted.
    acceptedPatterns: ["^my name is [a-z][a-z' -]{1,24}$"],
    example: 'My name is Mali.',
    explanation: "The pattern is 'My name is' + your name. Your own name is correct here.",
  },
  {
    id: 'w-003', topic: 'requests', difficulty: 4, type: 'writing',
    prompt: 'Ask your friend politely to open the window. Use: Could you ___, please?',
    answer: 'Could you open the window, please?',
    accepted: [
      'could you open the window please', 'can you open the window please',
      'would you open the window please', 'could you please open the window',
      'could you open the window for me please',
    ],
    acceptedPatterns: ['^(could|can|would) you (please )?open the window( for me)?(,)?( please)?$'],
    example: 'Could you open the window, please?',
    explanation: "'Could you open the window, please?' is a polite request.",
  },
  {
    id: 'w-004', topic: 'hobbies', difficulty: 4, type: 'writing',
    prompt: 'Write one sentence about a hobby you like. Use: I like ___.',
    answer: 'I like swimming.',
    accepted: [],
    // Only the sentence frame is marked. The hobby itself is the pupil's own
    // idea and is never marked wrong.
    acceptedPatterns: ['^i like [a-z][a-z ]{2,30}$'],
    example: 'I like swimming.',
    explanation: "Start with 'I like' and then your hobby. Your own hobby is correct here.",
  },
  {
    id: 'r-009', topic: 'routines', difficulty: 4, type: 'blank',
    prompt: 'On Sunday I ___ not go to school.',
    answer: 'do', accepted: [], example: 'do',
    explanation: "We make the negative with 'do not': 'I do not go to school.'",
  },
  {
    id: 'd-009', topic: 'food', difficulty: 4, type: 'blank',
    prompt: 'A: ___ you like some fruit? \u00a0 B: Yes, please.',
    answer: 'would', accepted: ['do'], example: 'would',
    explanation: "'Would you like ... ?' offers something politely.",
  },
  {
    id: 'c-008', topic: 'conversation', difficulty: 4, type: 'reading',
    passage:
      'Ploy: Excuse me. Where is the library?\n' +
      'Man: It is next to the school.\n' +
      'Ploy: Thank you!\n' +
      'Man: You are welcome.',
    prompt: 'Where is the library?',
    options: ['next to the school', 'inside the school', 'behind the market', 'near the river'],
    answer: 'next to the school', accepted: [],
    explanation: "The man says the library is 'next to the school'.",
  },
  {
    id: 'q-008', topic: 'requests', difficulty: 4, type: 'order',
    prompt: 'Put the words in order to ask for directions.',
    tokens: ['Excuse', 'me,', 'where', 'is', 'the', 'market?'],
    answer: 'Excuse me, where is the market?', accepted: [],
    explanation: "We start with 'Excuse me' before asking a stranger a question.",
  },
  {
    id: 'r-010', topic: 'routines', difficulty: 4, type: 'order',
    prompt: 'Put the words in order to talk about your evening.',
    tokens: ['I', 'do', 'my', 'homework', 'after', 'dinner.'],
    answer: 'I do my homework after dinner.', accepted: [],
    explanation: "We say 'do my homework'. 'After dinner' tells us when.",
  },
  {
    id: 'h-008', topic: 'hobbies', difficulty: 4, type: 'mc',
    prompt: "Nin says, 'I am learning to play the piano.' What is Nin's hobby?",
    options: ['music', 'football', 'cooking', 'painting'],
    answer: 'music', accepted: [],
    explanation: 'A piano makes music, so Nin\u2019s hobby is music.',
  },
  {
    id: 'w-005', topic: 'requests', difficulty: 4, type: 'writing',
    prompt: 'Your teacher gives you a book. Write a short polite answer.',
    answer: 'Thank you.',
    accepted: [
      'thank you', 'thanks', 'thank you very much', 'thank you teacher',
      'thank you miss', 'thank you sir', 'thank you so much',
    ],
    acceptedPatterns: ['^(thank you|thanks)( very much| so much| teacher| miss| sir)?$'],
    example: 'Thank you.',
    explanation: 'We say "Thank you" when someone gives us something.',
  },
  {
    id: 'c-009', topic: 'conversation', difficulty: 4, type: 'reading',
    passage:
      'Mali: Dao, you look sad. What is wrong?\n' +
      'Dao: I lost my pencil case.\n' +
      "Mali: Don't worry. You can use my pencil.",
    prompt: 'Why is Dao sad?',
    options: ['She lost her pencil case.', 'She is hungry.', 'She is tired.', 'She has no friends.'],
    answer: 'She lost her pencil case.', accepted: [],
    explanation: "Dao says 'I lost my pencil case.'",
  },
  {
    id: 'f-011', topic: 'feelings', difficulty: 4, type: 'mc',
    prompt: 'Dao lost her pencil case, and Mali shared her pencil. How does Dao feel now?',
    options: ['better', 'worse', 'angry', 'hungry'],
    answer: 'better', accepted: [],
    explanation: 'A kind friend helps us feel better.',
  },

  // -----------------------------------------------------------------------
  // Difficulty 5 - a little difficult
  // -----------------------------------------------------------------------
  {
    id: 'c-010', topic: 'conversation', difficulty: 5, type: 'reading',
    passage: PASSAGES.market,
    prompt: 'How many apples does Nin buy?',
    options: ['three', 'two', 'thirty', 'one'],
    answer: 'three', accepted: [],
    explanation: "Nin says 'I would like three apples.'",
  },
  {
    id: 'c-011', topic: 'conversation', difficulty: 5, type: 'reading',
    passage: PASSAGES.market,
    prompt: 'How much do the apples cost?',
    options: ['thirty baht', 'three baht', 'thirteen baht', 'three hundred baht'],
    answer: 'thirty baht', accepted: [],
    explanation: "The shopkeeper says 'That is thirty baht.'",
  },
  {
    id: 'c-012', topic: 'conversation', difficulty: 5, type: 'blank',
    passage:
      'A: Good morning!\n' +
      'B: Good morning! Come in, please.\n' +
      'A: Thank you.\n' +
      'B: ___ you like some tea?',
    prompt: 'Write the missing word in the last line.',
    answer: 'would', accepted: [], example: 'would',
    explanation: "'Would you like some tea?' is a polite offer.",
  },
  {
    id: 'w-006', topic: 'feelings', difficulty: 5, type: 'writing',
    prompt: "Your friend is sad. Write one kind sentence. Use: Don't ___.",
    answer: "Don't worry.",
    accepted: ['dont worry', "don't worry", 'dont be sad', "don't be sad", 'dont cry', "don't cry"],
    acceptedPatterns: ["^don'?t (worry|be sad|cry|be worried)( ,)?( i am here| i will help you)?$"],
    example: "Don't worry.",
    explanation: "'Don't worry.' is a kind thing to say to a sad friend.",
  },
  {
    id: 'r-011', topic: 'routines', difficulty: 5, type: 'order',
    prompt: 'Put the words in order to talk about your morning.',
    tokens: ['I', 'usually', 'get', 'up', 'at', 'half', 'past', 'six.'],
    answer: 'I usually get up at half past six.', accepted: [],
    explanation: "'Usually' comes before the verb. 'Half past six' means 6:30.",
  },
  {
    id: 'c-013', topic: 'conversation', difficulty: 5, type: 'order',
    prompt: 'Put the four lines in order to make a conversation.',
    tokens: ['Hello, Mali!', 'Hello, Nok! How are you?', 'I am fine, thank you. And you?', 'I am very well, thanks.'],
    answer: 'Hello, Mali! Hello, Nok! How are you? I am fine, thank you. And you? I am very well, thanks.',
    accepted: [],
    explanation: 'First we greet, then we ask "How are you?", then we answer and ask back.',
  },
  {
    id: 'h-009', topic: 'hobbies', difficulty: 5, type: 'blank',
    prompt: 'Art is my hobby. I use a brush and some ___ to make pictures.',
    answer: 'paint', accepted: ['paints', 'colours', 'colors', 'water'], example: 'paint',
    explanation: 'We make pictures with a brush and paint.',
  },
  {
    id: 'w-007', topic: 'food', difficulty: 5, type: 'writing',
    prompt: 'Invite your friend to eat with you. Use: Would you like ___?',
    answer: 'Would you like some rice?',
    accepted: [],
    acceptedPatterns: ['^would you like (some |a |an |to )?[a-z][a-z ]{1,28}$'],
    example: 'Would you like some rice?',
    explanation: "'Would you like some ... ?' is a kind invitation. Your own food word is correct here.",
  },
  {
    id: 'c-014', topic: 'conversation', difficulty: 5, type: 'reading',
    passage:
      'Teacher: Who would like to help me?\n' +
      'Mali: I would, Miss.\n' +
      'Teacher: Thank you, Mali. Please carry these books.\n' +
      'Mali: Yes, Miss.',
    prompt: 'What will Mali do?',
    options: ['carry the books', 'clean the board', 'read a story', 'go home'],
    answer: 'carry the books', accepted: [],
    explanation: 'The teacher asks Mali to carry the books.',
  },
  {
    id: 'q-009', topic: 'requests', difficulty: 5, type: 'mc',
    prompt: 'Which request is the most polite?',
    options: ['Could you help me, please?', 'Help me.', 'I need help now.', 'You help me.'],
    answer: 'Could you help me, please?', accepted: [],
    explanation: "'Could you ... , please?' is the most polite. The others sound like orders.",
  },
  {
    id: 'i-009', topic: 'introductions', difficulty: 5, type: 'order',
    prompt: 'Put the words in order to introduce your friend.',
    tokens: ['This', 'is', 'my', 'friend', 'Dao.', 'She', 'is', 'eleven.'],
    answer: 'This is my friend Dao. She is eleven.', accepted: [],
    explanation: "We introduce with 'This is my friend ...' and then add more information.",
  },
  {
    id: 'f-012', topic: 'feelings', difficulty: 5, type: 'reading',
    passage:
      'Nok: I am a bit nervous. We have a reading test today.\n' +
      'Mali: You read very well, Nok. You can do it!\n' +
      'Nok: Thank you. Now I feel better.',
    prompt: 'How does Nok feel at the end?',
    options: ['better', 'more nervous', 'sad', 'angry'],
    answer: 'better', accepted: [],
    explanation: "Nok says 'Now I feel better' after Mali helps him.",
  },
  {
    id: 'r-012', topic: 'routines', difficulty: 5, type: 'blank',
    prompt: 'My sister ___ up at seven o\u2019clock. (she / get up)',
    answer: 'gets', accepted: [], example: 'gets',
    explanation: "With 'he', 'she' or 'my sister' we add -s: 'She gets up.'",
  },
  {
    id: 'd-010', topic: 'food', difficulty: 5, type: 'reading',
    passage:
      'Waiter: Good evening. What would you like?\n' +
      'Ploy: I would like fried rice, please.\n' +
      'Waiter: And to drink?\n' +
      'Ploy: Water, please. I am very thirsty.',
    prompt: 'What does Ploy want to drink?',
    options: ['water', 'juice', 'milk', 'tea'],
    answer: 'water', accepted: [],
    explanation: "Ploy asks for water because she is thirsty.",
  },
  {
    id: 'h-010', topic: 'hobbies', difficulty: 5, type: 'reading',
    passage:
      'Anan: My hobby is growing plants. I have ten pots at home.\n' +
      'Dao: That is interesting! Is it hard work?\n' +
      'Anan: A little. I water them every morning.',
    prompt: 'How often does Anan water the plants?',
    options: ['every morning', 'every evening', 'once a week', 'never'],
    answer: 'every morning', accepted: [],
    explanation: "Anan says 'I water them every morning.'",
  },
  {
    id: 'g-011', topic: 'greetings', difficulty: 5, type: 'writing',
    prompt: 'You are going home. Say goodbye to your teacher politely.',
    answer: 'Goodbye, Miss. See you tomorrow.',
    accepted: [
      'goodbye', 'goodbye miss', 'goodbye miss see you tomorrow',
      'goodbye teacher', 'goodbye see you tomorrow', 'good bye miss',
      'goodbye sir', 'see you tomorrow miss', 'goodbye miss thank you',
    ],
    acceptedPatterns: ['^(good ?bye|see you)( ,)?( miss| sir| teacher)?( ,)?( see you tomorrow| goodbye| thank you| tomorrow)?$'],
    example: 'Goodbye, Miss. See you tomorrow.',
    explanation: "'Goodbye, Miss.' is polite. You can add 'See you tomorrow.'",
  },
  {
    id: 'q-010', topic: 'requests', difficulty: 5, type: 'blank',
    prompt: 'A: May I use your rubber, please? \u00a0 B: Yes, here you ___.',
    answer: 'are', accepted: [], example: 'are',
    explanation: "'Here you are.' is what we say when we give something to someone.",
  },
  {
    id: 'i-010', topic: 'introductions', difficulty: 5, type: 'writing',
    prompt: 'Tell us your age. Use: I am ___ years old.',
    answer: 'I am eleven years old.',
    accepted: [],
    acceptedPatterns: ['^i am [a-z0-9][a-z0-9 -]{0,18} years old$'],
    example: 'I am eleven years old.',
    explanation: "The pattern is 'I am' + your age + 'years old'. Your own age is correct here.",
  },
  {
    id: 'c-015', topic: 'conversation', difficulty: 5, type: 'reading',
    passage:
      'Mali: Nok, where are the festival flags?\n' +
      'Nok: I put them in the big box near the stage.\n' +
      'Mali: Thank you! I will carry the box to the square.',
    prompt: 'Where are the festival flags now?',
    options: ['in a box near the stage', 'in the square', 'at the market', 'in the caf\u00e9'],
    answer: 'in a box near the stage', accepted: [],
    explanation: "Nok says the flags are 'in the big box near the stage'.",
  },
];

/**
 * Check the bank for structural problems. Run by the test suite and by the
 * teacher's question editor so a bad edit cannot reach pupils.
 * @param {Array} bank
 * @returns {string[]} list of human-readable problems (empty when healthy)
 */
function validateBank(bank) {
  const problems = [];
  const seen = new Set();

  for (const q of bank) {
    const where = `question ${q.id || '(missing id)'}`;
    if (!q.id || typeof q.id !== 'string') problems.push(`${where}: missing id`);
    if (seen.has(q.id)) problems.push(`${where}: duplicate id`);
    seen.add(q.id);

    if (!TOPICS.includes(q.topic)) problems.push(`${where}: unknown topic "${q.topic}"`);
    if (!TYPES.includes(q.type)) problems.push(`${where}: unknown type "${q.type}"`);
    if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) {
      problems.push(`${where}: difficulty must be 1-5`);
    }
    if (!q.prompt || typeof q.prompt !== 'string' || q.prompt.trim() === '') {
      problems.push(`${where}: missing prompt`);
    }
    if (!q.explanation || q.explanation.trim() === '') problems.push(`${where}: missing explanation`);
    if (typeof q.answer !== 'string' || q.answer.trim() === '') problems.push(`${where}: missing answer`);
    if (!Array.isArray(q.accepted)) problems.push(`${where}: accepted must be an array`);

    if (q.type === 'mc' || q.type === 'reading') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        problems.push(`${where}: needs at least two options`);
      } else {
        if (!q.options.includes(q.answer)) problems.push(`${where}: answer is not one of the options`);
        if (new Set(q.options).size !== q.options.length) problems.push(`${where}: duplicate options`);
      }
    }
    if (q.type === 'reading' && (!q.passage || q.passage.trim() === '')) {
      problems.push(`${where}: reading questions need a passage`);
    }
    if (q.type === 'reading') {
      const lines = (q.passage || '').split('\n').filter((l) => l.trim() !== '');
      if (lines.length < 2 || lines.length > 4) {
        problems.push(`${where}: passage should be 2-4 lines, found ${lines.length}`);
      }
    }
    if (q.type === 'order') {
      if (!Array.isArray(q.tokens) || q.tokens.length < 3) {
        problems.push(`${where}: order questions need at least three tokens`);
      } else if (q.tokens.join(' ') !== q.answer) {
        problems.push(`${where}: tokens joined by spaces must equal the answer`);
      }
    }
    if (q.type === 'blank' || q.type === 'writing') {
      if (!q.example || q.example.trim() === '') problems.push(`${where}: typed questions need an example`);
    }
    if (q.type === 'writing') {
      const hasAccepted = Array.isArray(q.accepted) && q.accepted.length > 0;
      const hasPatterns = Array.isArray(q.acceptedPatterns) && q.acceptedPatterns.length > 0;
      if (!hasAccepted && !hasPatterns) {
        problems.push(`${where}: writing questions must list accepted answers or patterns`);
      }
      for (const source of q.acceptedPatterns || []) {
        if (!source.startsWith('^') || !source.endsWith('$')) {
          problems.push(`${where}: pattern "${source}" must be anchored with ^ and $`);
        }
        try {
          new RegExp(source);
        } catch (err) {
          problems.push(`${where}: pattern "${source}" is not valid (${err.message})`);
        }
      }
    }
  }
  return problems;
}

/** Strip everything a pupil must not receive before they answer. */
function forPupil(question) {
  const safe = {
    id: question.id,
    topic: question.topic,
    difficulty: question.difficulty,
    type: question.type,
    prompt: question.prompt,
  };
  if (question.passage) safe.passage = question.passage;
  if (question.options) safe.options = question.options.slice();
  if (question.tokens) safe.shuffled = shuffleTokens(question.tokens, question.id);

  // The `example` field often *is* the answer (e.g. a one-word blank), so it is
  // never sent before the pupil answers. It reaches them through feedback only.
  // Instead we send a neutral hint about the expected shape of the input.
  if (question.type === 'blank') {
    safe.inputHint = 'Write the missing word.';
  } else if (question.type === 'writing') {
    safe.inputHint = 'Write one short sentence.';
  }
  return safe;
}

/**
 * Deterministic shuffle so a pupil who refreshes sees the same arrangement.
 * Guaranteed not to return the already-correct order.
 */
function shuffleTokens(tokens, seedText) {
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) % 2147483647;
  const rand = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const out = tokens.slice();
  for (let attempt = 0; attempt < 5; attempt++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.join(' ') !== tokens.join(' ')) return out;
  }
  // Fall back to a rotation, which cannot equal the original for length > 1.
  return tokens.slice(1).concat(tokens.slice(0, 1));
}

module.exports = { QUESTIONS, TOPICS, TYPES, validateBank, forPupil, shuffleTokens };
