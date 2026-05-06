export function getCurrentAcademicYear(date = new Date()) {
  const year = date.getFullYear();
  const startsThisYear = date.getMonth() >= 7;
  const startYear = startsThisYear ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function isCurrentAcademicYear(academicYear?: string | null) {
  return academicYear === getCurrentAcademicYear();
}
