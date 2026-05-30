/**
 * General Doctor Algorithm
 * Provides clinical decision support for primary screening and specialist referral
 * Analyzes patient findings and recommends investigations, diagnosis, and department referral
 */

/**
 * Dental issue detection based on examination findings
 */
const detectDentalIssues = (form) => {
  const issues = [];

  // Caries detection
  if (form.dentalCaries && form.dentalCaries.toLowerCase().includes('present')) {
    issues.push({
      name: 'Dental Caries',
      severity: 'High',
      specialists: ['Endodontics', 'Conservative Dentistry'],
      investigations: ['IOPA', 'Bitewing'],
    });
  }

  // Periodontal issues
  const gingivalProblems = [
    form.gingival,
    form.alveolarMucosa,
    form.calculusAndStains,
  ]
    .filter((f) => f)
    .join(' ')
    .toLowerCase();

  if (
    gingivalProblems.includes('swelling') ||
    gingivalProblems.includes('bleeding') ||
    gingivalProblems.includes('calculus') ||
    gingivalProblems.includes('plaque')
  ) {
    issues.push({
      name: 'Periodontal Disease',
      severity: 'High',
      specialists: ['Periodontics'],
      investigations: ['OPG', 'Periodontal probing'],
    });
  }

  // Missing teeth
  if (form.missingTeeth && form.missingTeeth.toLowerCase().includes('yes')) {
    issues.push({
      name: 'Tooth Loss',
      severity: 'Medium',
      specialists: ['Prosthodontics', 'Implantology'],
      investigations: ['OPG', 'CBCT for implant'],
    });
  }

  // Occlusion problems
  if (form.occlusion) {
    const occlText = form.occlusion.toLowerCase();
    if (occlText.includes('malocclusion') || occlText.includes('crossbite') || occlText.includes('open bite')) {
      issues.push({
        name: 'Malocclusion',
        severity: 'Medium',
        specialists: ['Orthodontics'],
        investigations: ['OPG', 'Cephalogram', 'Intraoral photos'],
      });
    }
  }

  // TMJ problems
  const tmjProblems = [form.tmjInspection, form.tmjPalpation, form.tmjPercussionAuscultation]
    .filter((f) => f)
    .join(' ')
    .toLowerCase();

  if (
    tmjProblems.includes('clicking') ||
    tmjProblems.includes('popping') ||
    tmjProblems.includes('pain') ||
    tmjProblems.includes('deviation')
  ) {
    issues.push({
      name: 'TMJ Dysfunction',
      severity: 'Medium',
      specialists: ['Oral & Maxillofacial Surgery'],
      investigations: ['TMJ imaging', 'MRI'],
    });
  }

  // Oral lesions/Pathology
  const lesionText = [form.lesionInspection, form.lesionPalpation, form.summary]
    .filter((f) => f)
    .join(' ')
    .toLowerCase();

  if (
    lesionText.includes('ulcer') ||
    lesionText.includes('lesion') ||
    lesionText.includes('swelling') ||
    lesionText.includes('growth') ||
    lesionText.includes('erythema')
  ) {
    issues.push({
      name: 'Oral Pathology',
      severity: 'High',
      specialists: ['Oral Medicine', 'Oral & Maxillofacial Surgery'],
      investigations: ['Biopsy', 'Histopathology', 'Cytology'],
    });
  }

  // Child-specific issues
  const age = parseInt(form.age, 10);
  if (age <= 12) {
    issues.push({
      name: 'Pediatric Patient',
      severity: 'Routine',
      specialists: ['Pedodontics'],
      investigations: ['OPG for growth assessment'],
      note: 'Refer to pediatric dentistry for age-appropriate care',
    });
  }

  // Systemic disease indicators
  const medicalHistory = [
    form.pastMedicalHistory,
    form.generalExamination,
    form.cns,
    form.cvs,
    form.respiratory,
    form.gastrointestinal,
  ]
    .filter((f) => f)
    .join(' ')
    .toLowerCase();

  if (
    medicalHistory.includes('diabetes') ||
    medicalHistory.includes('hypertension') ||
    medicalHistory.includes('cardiac')
  ) {
    issues.push({
      name: 'Systemic Disease Impact',
      severity: 'High',
      note: 'Requires careful treatment planning; consider medical referral',
      investigations: ['Blood tests', 'Medical clearance'],
    });
  }

  return issues;
};

/**
 * Recommend investigations based on findings and provisional diagnosis
 */
const recommendInvestigations = (form, issues) => {
  const investigations = new Set();

  // Always recommend basic OPG for general screening
  investigations.add('OPG (Panoramic X-ray)');
  investigations.add('Intraoral Periapical (IOPA)');

  // Add issue-specific investigations
  issues.forEach((issue) => {
    if (issue.investigations) {
      issue.investigations.forEach((inv) => investigations.add(inv));
    }
  });

  // Clinical examination findings that suggest investigations
  if (form.provisionalDiagnosis) {
    const diagText = form.provisionalDiagnosis.toLowerCase();
    if (diagText.includes('infection') || diagText.includes('abscess')) {
      investigations.add('Blood culture');
      investigations.add('Antibiotic sensitivity');
    }
    if (diagText.includes('cyst') || diagText.includes('tumor')) {
      investigations.add('CBCT (Cone Beam CT)');
      investigations.add('Biopsy');
    }
  }

  // Soft tissue findings
  if (form.tongue || form.palate || form.buccalMucosa) {
    const softTissue = [form.tongue, form.palate, form.buccalMucosa]
      .filter((f) => f)
      .join(' ')
      .toLowerCase();
    if (
      softTissue.includes('ulcer') ||
      softTissue.includes('nodule') ||
      softTissue.includes('atrophic') ||
      softTissue.includes('white')
    ) {
      investigations.add('Biopsy');
      investigations.add('Cytology');
    }
  }

  return Array.from(investigations);
};

/**
 * Recommend specialist department for referral
 */
const recommendReferralDepartment = (issues, age, provisionalDiagnosis = '') => {
  const departmentScore = {};

  // Initialize departments
  const departments = [
    'Pedodontics',
    'Orthodontics',
    'Periodontics',
    'Endodontics',
    'Prosthodontics',
    'Conservative Dentistry',
    'Oral & Maxillofacial Surgery',
    'Implantology',
  ];

  departments.forEach((dept) => {
    departmentScore[dept] = 0;
  });

  // Score departments based on issues
  issues.forEach((issue) => {
    if (issue.specialists) {
      issue.specialists.forEach((spec) => {
        if (departmentScore[spec] !== undefined) {
          departmentScore[spec] += issue.severity === 'High' ? 3 : issue.severity === 'Medium' ? 2 : 1;
        }
      });
    }
  });

  // Get top recommended departments
  const sorted = Object.entries(departmentScore)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return sorted.length > 0 ? sorted.map(([dept]) => dept) : [];
};

/**
 * Generate clinical summary and recommendations
 */
const generateClinicalSummary = (form) => {
  const issues = detectDentalIssues(form);
  const investigations = recommendInvestigations(form, issues);
  const referralDepartments = recommendReferralDepartment(issues, parseInt(form.age, 10));

  return {
    detectedIssues: issues,
    suggestedInvestigations: investigations,
    recommendedDepartments: referralDepartments,
    requiresImmediate: issues.some((i) => i.severity === 'High'),
    summary: generateSummaryText(issues, referralDepartments),
  };
};

/**
 * Generate readable summary text for doctor
 */
const generateSummaryText = (issues, departments) => {
  if (issues.length === 0) {
    return 'No significant dental issues detected. Continue routine follow-up.';
  }

  let text = `Detected Issues: ${issues.map((i) => i.name).join(', ')}.\n\n`;

  if (departments.length > 0) {
    text += `Recommended Referral: ${departments.join(', ')}\n`;
  }

  const urgent = issues.some((i) => i.severity === 'High');
  if (urgent) {
    text += '\n⚠️ HIGH PRIORITY: Patient requires immediate specialist evaluation.';
  }

  return text;
};

/**
 * Generate patient education text
 */
const generatePatientEducation = (issues) => {
  let education = [];

  issues.forEach((issue) => {
    switch (issue.name) {
      case 'Dental Caries':
        education.push('• Regular brushing with fluoride toothpaste and flossing can help prevent tooth decay');
        break;
      case 'Periodontal Disease':
        education.push('• Maintain good oral hygiene: brush twice daily, floss regularly, and visit dentist every 6 months');
        break;
      case 'Tooth Loss':
        education.push('• Missing teeth can affect chewing and speech; consult specialist for replacement options');
        break;
      case 'Malocclusion':
        education.push('• Improper bite can cause jaw pain and affect appearance; orthodontic evaluation recommended');
        break;
      case 'TMJ Dysfunction':
        education.push('• Jaw joint problems may cause pain and clicking; avoid hard/chewy foods and use ice for relief');
        break;
      case 'Oral Pathology':
        education.push('• Any unusual growths or lesions should be evaluated immediately by a specialist');
        break;
      default:
        break;
    }
  });

  return education.length > 0 ? education.join('\n') : 'Maintain good oral hygiene and visit dentist regularly.';
};

/**
 * Classify urgency level
 */
const classifyUrgency = (issues, form) => {
  const hasHighSeverity = issues.some((i) => i.severity === 'High');
  const hasSoftTissueLesion =
    form.lesionInspection ||
    form.lesionPalpation ||
    (form.summary && form.summary.toLowerCase().includes('ulcer'));

  if (hasHighSeverity || hasSoftTissueLesion) {
    return { level: 'URGENT', recommendation: 'Schedule specialist appointment within 1 week' };
  }

  const hasMediumSeverity = issues.some((i) => i.severity === 'Medium');
  if (hasMediumSeverity) {
    return { level: 'HIGH', recommendation: 'Schedule specialist appointment within 2-3 weeks' };
  }

  return { level: 'ROUTINE', recommendation: 'Schedule follow-up in 3-6 months' };
};

export {
  detectDentalIssues,
  recommendInvestigations,
  recommendReferralDepartment,
  generateClinicalSummary,
  generateSummaryText,
  generatePatientEducation,
  classifyUrgency,
};
