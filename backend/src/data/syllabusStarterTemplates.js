// Built-in starter library. Loaded into syllabus_templates (schoolId = null) the first time any
// school opens the syllabus screens. Chapter names follow the current NCERT textbooks (rationalised).
// More boards / classes / subjects (MP Board etc.) are added by schools through CSV import or
// "Save as template", so nothing here needs a code change.
const NCERT = 'NCERT / CBSE';

const STARTER_TEMPLATES = [
  {
    board: NCERT,
    className: 'Class 9',
    subjectName: 'Mathematics',
    chapters: [
      'Number Systems',
      'Polynomials',
      'Coordinate Geometry',
      'Linear Equations in Two Variables',
      "Introduction to Euclid's Geometry",
      'Lines and Angles',
      'Triangles',
      'Quadrilaterals',
      'Circles',
      "Heron's Formula",
      'Surface Areas and Volumes',
      'Statistics',
    ],
  },
  {
    board: NCERT,
    className: 'Class 9',
    subjectName: 'Science',
    chapters: [
      'Matter in Our Surroundings',
      'Is Matter Around Us Pure?',
      'Atoms and Molecules',
      'Structure of the Atom',
      'The Fundamental Unit of Life',
      'Tissues',
      'Motion',
      'Force and Laws of Motion',
      'Gravitation',
      'Work and Energy',
      'Sound',
      'Improvement in Food Resources',
    ],
  },
  {
    board: NCERT,
    className: 'Class 10',
    subjectName: 'Mathematics',
    chapters: [
      'Real Numbers',
      'Polynomials',
      'Pair of Linear Equations in Two Variables',
      'Quadratic Equations',
      'Arithmetic Progressions',
      'Triangles',
      'Coordinate Geometry',
      'Introduction to Trigonometry',
      'Some Applications of Trigonometry',
      'Circles',
      'Areas Related to Circles',
      'Surface Areas and Volumes',
      'Statistics',
      'Probability',
    ],
  },
  {
    board: NCERT,
    className: 'Class 10',
    subjectName: 'Science',
    chapters: [
      'Chemical Reactions and Equations',
      'Acids, Bases and Salts',
      'Metals and Non-metals',
      'Carbon and its Compounds',
      'Life Processes',
      'Control and Coordination',
      'How do Organisms Reproduce?',
      'Heredity',
      'Light - Reflection and Refraction',
      'The Human Eye and the Colourful World',
      'Electricity',
      'Magnetic Effects of Electric Current',
      'Our Environment',
    ],
  },
];

module.exports = { STARTER_TEMPLATES, NCERT };