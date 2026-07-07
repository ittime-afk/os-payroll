import * as XLSX from 'xlsx';

// 37개 칼럼 원래 필드 리스트 및 초깃값
const DEFAULT_PAYROLL_DATA = {
  name: '',
  employeeCode: '',
  baseSalary: 0, // 기본급 (보통 + 근속 합산)
  baseSalaryNormal: 0, // 보통기본급
  baseSalaryService: 0, // 근속기본급
  weeklyHolidayAllowance: 0, // 주휴수당
  mealAllowance: 0, // 식대보조
  fullAttendanceAllowance: 0, // 만근수당
  overtimeAllowance: 0, // 연장수당 (메모/호환용)
  annualLeaveAllowance: 0, // 연차수당 (메모/호환용)
  responsibilityAllowance: 0, // 책임수당 (반장1 + 반장2 합산)
  responsibilityAllowance1: 0, // 반장 1
  responsibilityAllowance2: 0, // 반장 2
  irregularIncentive: 0, // 비정기 인센티브
  bonus: 0, // 상여
  drivingAllowance: 0, // 자가운전보조
  childcareAllowance: 0, // 육아수당
  otherAllowance: 0, // 기타수당 (기타수당1 + 기타수당2 합산)
  otherAllowance1: 0, // 기타수당 1
  otherAllowance2: 0, // 기타수당 2
  totalAllowance: 0, // 소득총액
  taxableTotal: 0, // 과세합계
  
  nationalPension: 0,
  healthInsurance: 0,
  longTermCare: 0,
  employmentInsurance: 0,
  incomeTax: 0,
  localIncomeTax: 0,
  advancePayment: 0, // 가불
  dormitoryFee: 0, // 기숙사비 (기존 호환용)
  yearEndIncomeTax: 0,
  yearEndLocalIncomeTax: 0,
  totalDeduction: 0, // 공제총액 (가불포함)
  
  netPay: 0, // 실제지급액(가불미포함)
  deductibleTax: 0, // 공제액(가불제외)
  totalAfterTax: 0, // 실제지급액(가불포함)
  
  overtimeHours: 0, // 연장근로시간
  leaveDaysUsed: 0, // 연차/휴일사용일수
  
  bankName: '신한',
  accountNumber: '',
  accountHolder: '',

  individualMemo: '' // D열 시간급(메모) ➡️ 개별 메모로 매핑
};

/**
 * 숫자로 안전하게 변환
 */
const parseNumber = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/,/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * 엑셀 파일 내의 모든 시트(탭) 이름 배열을 가져오는 함수
 */
export const getExcelSheetNames = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', bookSheets: true });
        resolve(workbook.SheetNames || []);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * 엑셀 파일을 읽고 데이터를 파싱하는 함수 (시트 선택 및 D열 개별 메모 추가 연동)
 */
export const parsePayrollExcel = (file, targetSheetName = null) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = targetSheetName || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet) {
          throw new Error(`선택하신 시트 [${sheetName}]가 파일 내에 존재하지 않습니다.`);
        }
        
        // 2차원 배열 형태로 시트 파싱
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (rawRows.length < 5) {
          throw new Error('급여 데이터 행이 부족합니다. 템플릿의 5행부터 데이터가 존재해야 합니다.');
        }

        // 5번째 행(인덱스 4)부터 데이터 루프 실행
        const parsedRows = [];
        
        for (let i = 4; i < rawRows.length; i++) {
          const row = rawRows[i];
          
          // E열 번호(index 4)가 없으면 루프 스킵
          if (!row || row.length < 6 || !String(row[4]).trim()) {
            continue; 
          }

          const payroll = { ...DEFAULT_PAYROLL_DATA, excelRowIndex: i + 1 };
          
          // 열 인덱스 기준 매핑 (A~AK)
          payroll.accountHolder = String(row[0] || '').trim(); // A열: 예금주
          payroll.bankName = String(row[1] || '신한').trim();   // B열: 은행
          payroll.accountNumber = String(row[2] || '').trim(); // C열: 계좌번호
          
          // D열(3): 시간급(메모) ➡️ 개별 메모로 파싱
          payroll.individualMemo = row[3] !== undefined && row[3] !== null ? String(row[3]).trim() : '';

          payroll.employeeCode = String(row[4] || '').trim();  // E열: 번호 (직원코드)
          payroll.name = String(row[5] || '').trim();          // F열: 소득자명단 (성명)
          // G열(6): 시작
          
          payroll.baseSalaryNormal = parseNumber(row[7]);      // H열: 보통
          payroll.baseSalaryService = parseNumber(row[8]);     // I열: 근속
          payroll.baseSalary = payroll.baseSalaryNormal + payroll.baseSalaryService;

          payroll.weeklyHolidayAllowance = parseNumber(row[9]); // J열: 주휴수당

          // 봉급인센 영역
          payroll.mealAllowance = parseNumber(row[10]);         // K열: 식대보조
          payroll.fullAttendanceAllowance = parseNumber(row[11]); // L열: 만근
          payroll.responsibilityAllowance1 = parseNumber(row[12]); // M열: 연장수당 (책임수당 1)
          payroll.responsibilityAllowance2 = parseNumber(row[13]); // N열: 연차수당 (책임수당 2)
          payroll.responsibilityAllowance = payroll.responsibilityAllowance1 + payroll.responsibilityAllowance2;
          
          payroll.irregularIncentive = parseNumber(row[14]);    // O열: 인센티브 (비정기 인센티브)
          payroll.bonus = parseNumber(row[15]);                 // P열: 상여
          payroll.otherAllowance1 = parseNumber(row[16]);       // Q열: 기타,책임수당 (기타수당 1)

          // 기타지급물 영역
          payroll.drivingAllowance = parseNumber(row[17]);      // R열: 자가운전보조/통신
          payroll.childcareAllowance = parseNumber(row[18]);    // S열: 육아보조 (육아수당)
          payroll.otherAllowance2 = parseNumber(row[19]);       // T열: 기타금품 (기타수당 2)
          payroll.otherAllowance = payroll.otherAllowance1 + payroll.otherAllowance2;

          payroll.totalAllowance = parseNumber(row[20]);        // U열: 소득총액
          payroll.taxableTotal = parseNumber(row[21]);          // V열: 과세합계

          // 세금, 4대보험 영역
          payroll.nationalPension = parseNumber(row[22]);       // W열: 국민연금
          payroll.healthInsurance = parseNumber(row[23]);        // X열: 건강보험
          payroll.longTermCare = parseNumber(row[24]);          // Y열: 장기요양
          payroll.employmentInsurance = parseNumber(row[25]);   // Z열: 고용보험
          payroll.incomeTax = parseNumber(row[26]);             // AA열: 소득세
          payroll.localIncomeTax = parseNumber(row[27]);        // AB열: 주민세
          payroll.yearEndIncomeTax = parseNumber(row[28]);      // AC열: 연말정산소득세
          payroll.yearEndLocalIncomeTax = parseNumber(row[29]); // AD열: 연말정산주민세

          payroll.advancePayment = parseNumber(row[30]);        // AE열: 가불
          payroll.totalDeduction = parseNumber(row[31]);        // AF열: 공제총액 (가불포함)
          payroll.netPay = parseNumber(row[32]);                // AG열: 실제지급액 (가불미포함)
          payroll.deductibleTax = parseNumber(row[33]);         // AH열: 공제액 (가불제외)
          payroll.totalAfterTax = parseNumber(row[34]);         // AI열: 실제지급액 (가불포함)
          
          payroll.overtimeHours = parseNumber(row[35]);         // AJ열: 연장근로시간
          payroll.leaveDaysUsed = parseNumber(row[36]);         // AK열: 연차/휴일사용일수

          // --- 데이터 무결성 자체 계산 검증 ---
          
          // 실제 계산된 소득총액
          const calcAllowance = 
            payroll.baseSalaryNormal + 
            payroll.baseSalaryService + 
            payroll.weeklyHolidayAllowance + 
            payroll.mealAllowance + 
            payroll.fullAttendanceAllowance + 
            payroll.responsibilityAllowance1 + 
            payroll.responsibilityAllowance2 + 
            payroll.irregularIncentive + 
            payroll.bonus + 
            payroll.drivingAllowance + 
            payroll.childcareAllowance + 
            payroll.otherAllowance1 + 
            payroll.otherAllowance2;
             
          // 실제 계산된 공제총액 (세금 + 가불)
          const calcDeduction = 
            payroll.nationalPension + 
            payroll.healthInsurance + 
            payroll.longTermCare + 
            payroll.employmentInsurance + 
            payroll.incomeTax + 
            payroll.localIncomeTax + 
            payroll.yearEndIncomeTax + 
            payroll.yearEndLocalIncomeTax + 
            payroll.advancePayment;

          // 실제 계산된 공제액 (가불제외 = 4대보험 + 세금)
          const calcTax = 
            payroll.nationalPension + 
            payroll.healthInsurance + 
            payroll.longTermCare + 
            payroll.employmentInsurance + 
            payroll.incomeTax + 
            payroll.localIncomeTax + 
            payroll.yearEndIncomeTax + 
            payroll.yearEndLocalIncomeTax;

          const errors = [];
          if (!payroll.employeeCode) errors.push('E열 번호(사원코드) 누락');
          if (!payroll.name) errors.push('F열 소득자명단 누락');
          
          if (Math.abs(payroll.totalAllowance - calcAllowance) > 10) {
            errors.push(`소득총액 불일치 (엑셀: ${payroll.totalAllowance.toLocaleString()}원, 계산: ${calcAllowance.toLocaleString()}원)`);
          }
          if (Math.abs(payroll.totalDeduction - calcDeduction) > 10) {
            errors.push(`공제총액 불일치 (엑셀: ${payroll.totalDeduction.toLocaleString()}원, 계산: ${calcDeduction.toLocaleString()}원)`);
          }
          const expectedNetPay = payroll.totalAllowance - payroll.totalDeduction;
          if (Math.abs(payroll.netPay - expectedNetPay) > 10) {
            errors.push(`실제지급(가불미포) 불일치 (엑셀: ${payroll.netPay.toLocaleString()}원, 계산: ${expectedNetPay.toLocaleString()}원)`);
          }
          if (Math.abs(payroll.deductibleTax - calcTax) > 10) {
            errors.push(`공제액(가불제외) 불일치 (엑셀: ${payroll.deductibleTax.toLocaleString()}원, 계산: ${calcTax.toLocaleString()}원)`);
          }

          payroll.validationErrors = errors;
          payroll.isValid = errors.length === 0;

          parsedRows.push(payroll);
        }

        resolve(parsedRows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * 복구된 37개 칼럼 이중 헤더 템플릿 다운로드
 */
export const downloadPayrollTemplate = () => {
  const aoaData = [
    // 1행: 타이틀
    ["2026년 06월 급여명세서"],
    // 2행: 회사명
    ["㈜ 오 성"],
    // 3행: 상위 헤더
    [
      "예금주", "은행", "계좌번호", "시간급\n(메모)", "번호", "소득자명단", "시작", 
      "기본급", "", "주휴수당", 
      "봉급인센", "", "", "", "", "", "", 
      "기타지급물", "", "", 
      "소득총액", "과세합계", 
      "세금, 4대보험", "", "", "", "", "", "", "", 
      "가불", 
      "공제총액\n(가불포함)", "실제지급\n(가불미포)", "공제액\n(가불제외)", "실제지급\n(가불포함)", 
      "연장\n근로시간", "연차/휴일\n사용일수"
    ],
    // 4행: 하위 헤더
    [
      "", "", "", "", "", "", "", 
      "보통", "근속", "", 
      "식대보조", "만근수당", "연장수당", "연차수당", "비정기인센티브", "상여", "기타,책임수당", 
      "자가운전보조\n/통신", "육아수당", "기타금품", 
      "", "", 
      "국민연금", "건강보험", "장기요양", "고용보험", "소득세", "주민세", "연말정산\n소득세", "연말정산\n주민세", 
      "", 
      "", "", "", "", 
      "", ""
    ],
    // 5행: 샘플 데이터 1
    [
      "이화룡", "신한", "110-042-386505", "특이사항 없음", 10001, "이화룡", 2015, 
      3220000, 0, 1090000, 
      200000, 0, 0, 0, 1600000, 0, 0, 
      200000, 0, 0, 
      6310000, 6310000, 
      283950, 251170, 28390, 56790, 740200, 74020, 0, 0, 
      0, 1434520, 4875480, 1434520, 4875480, 
      12, 0
    ],
    // 6행: 샘플 데이터 2
    [
      "이영준", "신한", "110-404-811058", "야근 추가분 지급", 10002, "이영준", 2015, 
      3220000, 0, 1090000, 
      200000, 0, 0, 0, 2110000, 0, 0, 
      200000, 0, 0, 
      6820000, 6820000, 
      302570, 301250, 33580, 61380, 856680, 85680, 0, 0, 
      0, 1641140, 5178860, 1641140, 5178860, 
      15, 1
    ]
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoaData);

  // 셀 병합 설정
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 36 } }, // 1행 타이틀 (A1:AK1)
    { s: { r: 1, c: 0 }, e: { r: 1, c: 36 } }, // 2행 회사명 (A2:AK2)
    
    // 3~4행 세로 병합
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }, // 예금주
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }, // 은행
    { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } }, // 계좌번호
    { s: { r: 2, c: 3 }, e: { r: 3, c: 3 } }, // 시간급
    { s: { r: 2, c: 4 }, e: { r: 3, c: 4 } }, // 번호
    { s: { r: 2, c: 5 }, e: { r: 3, c: 5 } }, // 소득자명단
    { s: { r: 2, c: 6 }, e: { r: 3, c: 6 } }, // 시작
    
    // 3행 가로 병합
    { s: { r: 2, c: 7 }, e: { r: 2, c: 8 } },   // 기본급 보통/근속
    { s: { r: 2, c: 10 }, e: { r: 2, c: 16 } }, // 봉급인센 (K~Q열)
    { s: { r: 2, c: 17 }, e: { r: 2, c: 19 } }, // 기타지급물 (R~T열)
    { s: { r: 2, c: 22 }, e: { r: 2, c: 29 } }, // 세금, 4대보험 (W~AD열)
    
    // 3~4행 세로 병합 (나머지 칼럼들)
    { s: { r: 2, c: 9 }, e: { r: 3, c: 9 } },   // 주휴수당
    { s: { r: 2, c: 20 }, e: { r: 3, c: 20 } }, // 소득총액
    { s: { r: 2, c: 21 }, e: { r: 3, c: 21 } }, // 과세합계
    { s: { r: 2, c: 30 }, e: { r: 3, c: 30 } }, // 가불
    { s: { r: 2, c: 31 }, e: { r: 3, c: 31 } }, // 공제총액
    { s: { r: 2, c: 32 }, e: { r: 3, c: 32 } }, // 실제지급(가불미포)
    { s: { r: 2, c: 33 }, e: { r: 3, c: 33 } }, // 공제액(가불제외)
    { s: { r: 2, c: 34 }, e: { r: 3, c: 34 } }, // 실제지급(가불포함)
    { s: { r: 2, c: 35 }, e: { r: 3, c: 35 } }, // 연장근로시간
    { s: { r: 2, c: 36 }, e: { r: 3, c: 36 } }  // 연차사용일수
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '급여입력');
  XLSX.writeFile(workbook, '급여업로드_공식양식.xlsx');
};

/**
 * 세무서 제출용 급여대장 엑셀 내보내기 (이메일, 예금주, 계좌 정보 제외 및 식대보조 비과세 한도 적용)
 */
export const exportPayrollToExcel = (salaries, yearMonthStr = '') => {
  const headers = [
    '직원코드', '성명', '보통기본급', '근속기본급', '주휴수당',
    '식대보조(비과세)', '식대보조(과세)', '만근수당', '연장수당', '연차수당',
    '비정기인센티브', '상여', '기타책임수당', '자가운전보조', '육아수당',
    '기타금품', '소득총액', '과세합계', '국민연금', '건강보험',
    '장기요양', '고용보험', '소득세', '주민세', '연말정산소득세',
    '연말정산주민세', '가불', '공제총액(가불포함)', '실제지급(가불미포)',
    '공제액(가불제외)', '실제지급(가불포함)', '연장근로시간', '연차사용일수', '개별메모'
  ];

  const rows = salaries.map(sal => {
    const mealAllowance = Number(sal.mealAllowance || 0);
    const mealNonTaxable = mealAllowance > 200000 ? 200000 : mealAllowance;
    const mealTaxable = mealAllowance > 200000 ? mealAllowance - 200000 : 0;

    return [
      sal.employeeCode || '',
      sal.name || '',
      Number(sal.baseSalaryNormal || 0),
      Number(sal.baseSalaryService || 0),
      Number(sal.weeklyHolidayAllowance || 0),
      mealNonTaxable,
      mealTaxable,
      Number(sal.fullAttendanceAllowance || 0),
      Number(sal.responsibilityAllowance1 || 0),
      Number(sal.responsibilityAllowance2 || 0),
      Number(sal.irregularIncentive || 0),
      Number(sal.bonus || 0),
      Number(sal.otherAllowance1 || 0),
      Number(sal.drivingAllowance || 0),
      Number(sal.childcareAllowance || 0),
      Number(sal.otherAllowance2 || 0),
      Number(sal.totalAllowance || 0),
      Number(sal.taxableTotal || sal.totalAllowance || 0),
      Number(sal.nationalPension || 0),
      Number(sal.healthInsurance || 0),
      Number(sal.longTermCare || 0),
      Number(sal.employmentInsurance || 0),
      Number(sal.incomeTax || 0),
      Number(sal.localIncomeTax || 0),
      Number(sal.yearEndIncomeTax || 0),
      Number(sal.yearEndLocalIncomeTax || 0),
      Number(sal.advancePayment || 0),
      Number(sal.totalDeduction || 0),
      Number(sal.netPay || 0),
      Number(sal.deductibleTax || 0),
      Number(sal.totalAfterTax || 0),
      Number(sal.overtimeHours || 0),
      Number(sal.leaveDaysUsed || 0),
      sal.individualMemo || ''
    ];
  });

  const wsData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '급여대장');
  
  const yyyyMM = yearMonthStr || new Date().toISOString().substring(0, 7);
  XLSX.writeFile(workbook, `급여대장_세무서제출용_${yyyyMM}.xlsx`);
};

