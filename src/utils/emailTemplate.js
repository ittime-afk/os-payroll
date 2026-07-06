/**
 * 메일 클라이언트와의 호환성이 뛰어난 Table 기반 급여명세서 HTML 빌더 (공통/개별 메모 연동 & 조건부 노출)
 */
export const generatePayrollEmailHtml = (payroll, companyLabel, roleLabel, commonMemo = '') => {
  const formatMoney = (val) => {
    return (Number(val) || 0).toLocaleString() + '원';
  };

  const [year, month] = payroll.yearMonth.split('-');

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>급여명세서</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Malgun Gothic', '맑은 고딕', helvetica, sans-serif; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 650px; margin: 40px auto; background-color: #ffffff; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #e2e8f0;">
        
        <!-- 상단 화려한 그라디언트 탑 바 -->
        <div style="height: 6px; background: linear-gradient(to right, #4f46e5, #a855f7, #ec4899);"></div>

        <!-- 헤더 영역 -->
        <div style="padding: 30px 40px; background-color: #ffffff; border-bottom: 1px solid #f1f5f9; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.03em;">${year}년 ${month}월 귀속 급여명세서</h1>
          <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b; font-weight: 500;">귀하의 소중한 근로에 깊이 감사드립니다.</p>
        </div>

        <!-- 사원 정보 요약 카드 -->
        <div style="margin: 25px 30px; padding: 20px 25px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
            <tr>
              <td style="padding: 6px 0; font-weight: bold; width: 50%;">성 명: <span style="color: #0f172a; margin-left: 6px;">${payroll.name}</span></td>
              <td style="padding: 6px 0; font-weight: bold; width: 50%;">사원코드: <span style="color: #0f172a; margin-left: 6px; font-family: monospace;">${payroll.employeeCode || '-'}</span></td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">회 사: <span style="color: #0f172a; margin-left: 6px;">${companyLabel}</span></td>
              <td style="padding: 6px 0; font-weight: bold;">소 속: <span style="color: #0f172a; margin-left: 6px;">${roleLabel}</span></td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">연장근로시간: <span style="color: #4f46e5; margin-left: 6px; font-family: monospace; font-weight: 900;">${payroll.overtimeHours || 0} 시간</span></td>
              <td style="padding: 6px 0; font-weight: bold;">연차/휴일사용일수: <span style="color: #4f46e5; margin-left: 6px; font-family: monospace; font-weight: 900;">${payroll.leaveDaysUsed || 0} 일</span></td>
            </tr>
          </table>
        </div>

        <!-- 지급/공제 상세 내역 테이블 -->
        <div style="margin: 0 30px 25px 30px;">
          <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            <thead>
              <tr>
                <th style="background-color: #4f46e5; color: #ffffff; padding: 10px 15px; font-size: 12px; font-weight: 900; text-align: left; border-top-left-radius: 8px; border-bottom-left-radius: 8px; width: 50%;">지급 항목</th>
                <th style="background-color: #e11d48; color: #ffffff; padding: 10px 15px; font-size: 12px; font-weight: 900; text-align: left; border-top-right-radius: 8px; border-bottom-right-radius: 8px; width: 50%;">공제 항목</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <!-- 지급 항목 상세 셀 -->
                <td style="vertical-align: top; padding: 15px 15px 10px 15px; border-right: 1px solid #e2e8f0;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">기본급</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.baseSalaryNormal)}</td>
                    </tr>
                    ${Number(payroll.baseSalaryService) > 0 ? `
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">근속 기본급</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.baseSalaryService)}</td>
                    </tr>
                    ` : ''}
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">주휴수당</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.weeklyHolidayAllowance)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">식대보조</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.mealAllowance)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">만근수당</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.fullAttendanceAllowance)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">연장수당</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.responsibilityAllowance1)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">연차수당</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.responsibilityAllowance2)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">비정기 인센티브</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.irregularIncentive)}</td>
                    </tr>
                    ${Number(payroll.bonus) > 0 ? `
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">상여</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.bonus)}</td>
                    </tr>
                    ` : ''}
                    ${Number(payroll.otherAllowance1) > 0 ? `
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">기타,책임수당</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.otherAllowance1)}</td>
                    </tr>
                    ` : ''}
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">자가운전보조</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.drivingAllowance)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">육아수당</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.childcareAllowance)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">기타금품</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.otherAllowance2)}</td>
                    </tr>
                    <tr style="background-color: #f8fafc;">
                      <td style="padding: 10px 0; font-size: 13px; font-weight: bold; color: #4f46e5; border-top: 1px solid #e2e8f0;">지급 합계 (소득총액)</td>
                      <td style="padding: 10px 0; font-size: 13px; font-weight: bold; color: #4f46e5; text-align: right; border-top: 1px solid #e2e8f0;">${formatMoney(payroll.totalAllowance)}</td>
                    </tr>
                  </table>
                </td>

                <!-- 공제 항목 상세 셀 -->
                <td style="vertical-align: top; padding: 15px 15px 10px 15px;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">국민연금</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.nationalPension)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">건강보험</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.healthInsurance)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">장기요양보험</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.longTermCare)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">고용보험</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.employmentInsurance)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">소득세</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.incomeTax)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">주민세</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.localIncomeTax)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">가불</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.advancePayment)}</td>
                    </tr>
                    ${Number(payroll.yearEndIncomeTax) > 0 ? `
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">연말정산소득세</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.yearEndIncomeTax)}</td>
                    </tr>
                    ` : ''}
                    ${Number(payroll.yearEndLocalIncomeTax) > 0 ? `
                    <tr>
                      <td style="padding: 6px 0; font-size: 12px; color: #475569; border-bottom: 1px dashed #f1f5f9;">연말정산 주민세</td>
                      <td style="padding: 6px 0; font-size: 12px; font-weight: bold; color: #0f172a; text-align: right; border-bottom: 1px dashed #f1f5f9;">${formatMoney(payroll.yearEndLocalIncomeTax)}</td>
                    </tr>
                    ` : ''}
                    <tr style="background-color: #f8fafc;">
                      <td style="padding: 10px 0; font-size: 13px; font-weight: bold; color: #e11d48; border-top: 1px solid #e2e8f0;">공제 합계 (공제총액)</td>
                      <td style="padding: 10px 0; font-size: 13px; font-weight: bold; color: #e11d48; text-align: right; border-top: 1px solid #e2e8f0;">${formatMoney(payroll.totalDeduction)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 최종 요약 박스 -->
        <div style="margin: 0 30px 25px 30px; padding: 20px; background-color: #f1f5f9; border-radius: 12px; border: 1px solid #e2e8f0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #cbd5e1; padding-bottom: 10px;">
              <td style="font-size: 13px; font-weight: bold; color: #475569; padding: 6px 0;">과세 합계</td>
              <td style="font-size: 13px; font-weight: bold; color: #0f172a; text-align: right; padding: 6px 0;">${formatMoney(payroll.taxableTotal || payroll.totalAllowance)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #cbd5e1; padding-bottom: 10px;">
              <td style="font-size: 13px; font-weight: bold; color: #475569; padding: 6px 0;">공제액 합계 (가불제외)</td>
              <td style="font-size: 13px; font-weight: bold; color: #e11d48; text-align: right; padding: 6px 0;">${formatMoney(payroll.deductibleTax)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #cbd5e1; padding-bottom: 10px;">
              <td style="font-size: 13px; font-weight: bold; color: #475569; padding: 6px 0;">실제지급액 (가불포함)</td>
              <td style="font-size: 13px; font-weight: bold; color: #4f46e5; text-align: right; padding: 6px 0;">${formatMoney(payroll.totalAfterTax)}</td>
            </tr>
            <tr>
              <td style="font-size: 15px; font-weight: 900; color: #0f172a; padding: 12px 0 0 0;">실제지급액 (가불미포함)</td>
              <td style="font-size: 18px; font-weight: 900; color: #4f46e5; text-align: right; padding: 12px 0 0 0;">${formatMoney(payroll.netPay)}</td>
            </tr>
          </table>
        </div>

        <!-- 공통 및 개별 메모/공지 영역 -->
        ${(commonMemo || payroll.individualMemo) ? `
          <div style="margin: 0 30px 25px 30px;">
            <table style="width: 100%; border-collapse: collapse; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; font-size: 12.5px; color: #92400e;">
              <tr>
                <td style="padding: 18px 20px;">
                  ${commonMemo ? `
                    <div style="margin-bottom: 12px;">
                      <strong style="color: #b45309; display: block; margin-bottom: 5px; font-size: 13px;">📢 공통 공지사항</strong>
                      <div style="white-space: pre-wrap; line-height: 1.6; font-weight: 500;">${commonMemo}</div>
                    </div>
                  ` : ''}
                  ${payroll.individualMemo ? `
                    <div>
                      <strong style="color: #b45309; display: block; margin-bottom: 5px; font-size: 13px;">📌 개별 전달사항</strong>
                      <div style="white-space: pre-wrap; line-height: 1.6; font-weight: 500;">${payroll.individualMemo}</div>
                    </div>
                  ` : ''}
                </td>
              </tr>
            </table>
          </div>
        ` : ''}

        <!-- 푸터 정보 영역 -->
        <div style="padding: 20px 30px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b; line-height: 1.5;">
          <p style="margin: 0; font-weight: bold; color: #334155;">본 급여명세서는 시스템에서 자동 발송되었습니다.</p>
          <p style="margin: 2px 0 0 0;">내용에 문의사항이 있으신 경우 사무실 급여담당자에게 연락해 주시기 바랍니다.</p>
          <p style="margin: 10px 0 0 0; font-size: 10px; color: #94a3b8; letter-spacing: 0.05em;">© ${year} ${companyLabel}. ALL RIGHTS RESERVED.</p>
        </div>

      </div>
    </body>
    </html>
  `;
};
