import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Eye, Printer, Loader2, Award, Shield, Sparkles, X } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const UserDashboard = ({ user, userData, handleLogout }) => {
  const [salaries, setSalaries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingSalary, setViewingSalary] = useState(null);

  // 회사 및 소속 라벨
  const COMPANY_LABELS = { osung: '오성합판', nbboard: 'nbboard' };
  const LOCATION_LABELS = {
    admin: '관리자', office: '사무실', sales: '영업부', production: '생산팀',
    shipping: '운송팀', forklift: '지게차', pur: 'PUR팀', ovl: 'OVL팀', lpm: 'LPM팀', cnc: 'CNC팀'
  };

  // --- 1. 본인의 공개(published) 급여 데이터만 실시간 조회 ---
  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, 'salaries'),
      where('uid', '==', user.uid),
      where('status', '==', 'published')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.yearMonth || '').localeCompare(a.yearMonth || ''));
      setSalaries(list);
      setIsLoading(false);
    }, (err) => {
      console.error(err);
      setIsLoading(false);
    });

    return () => unsub();
  }, [user]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-12 print:bg-white print:pb-0">
      <div className="fixed top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500 z-50 print:hidden"></div>
      
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 md:px-8 h-16 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-100 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <span className="font-black text-xl tracking-tight text-slate-800">오성 급여명세서 시스템</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-400 tracking-widest">Signed In As</span>
            <span className="text-sm font-black text-slate-800 flex items-center gap-1.5">
              {userData?.name || '사원'}
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold">
                {LOCATION_LABELS[userData?.role] || userData?.role || '사원'}
              </span>
            </span>
          </div>
          <button onClick={handleLogout} className="px-3 py-1.5 border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold text-xs">
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-4xl mx-auto w-full space-y-6 print:p-0 print:max-w-none">
        
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6 print:hidden">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">안녕하세요, {userData?.name || '임직원'} 님</h2>
              <p className="text-xs text-slate-400 font-medium">귀하의 월별 급여명세 발행 내역입니다. (보안 접속 중)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-100 shrink-0">
            <Shield size={14} className="text-green-500" />
            조회 전용 모드
          </div>
        </div>

        {/* 목록 테이블 */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
              <Sparkles className="text-yellow-500 fill-yellow-500 w-4 h-4" /> 나의 명세서 내역
            </h3>
            <p className="text-xs text-slate-400 font-medium">관리자가 승인/공개한 명세서만 나열됩니다.</p>
          </div>

          {isLoading ? (
            <div className="p-16 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <span className="text-xs text-slate-400 font-bold">로딩 중...</span>
            </div>
          ) : salaries.length === 0 ? (
            <div className="p-16 text-center text-slate-400 font-semibold bg-slate-50/20">
              공개된 급여 명세서가 존재하지 않습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-xs font-black text-slate-500 border-b border-slate-200">
                    <th className="p-4 text-center">번호</th>
                    <th className="p-4">귀속년월</th>
                    <th className="p-4 text-right">소득총액 (지급총액)</th>
                    <th className="p-4 text-right">공제총액 (가불포함)</th>
                    <th className="p-4 text-right">실제지급 (가불미포)</th>
                    <th className="p-4 text-center">연장근로시간</th>
                    <th className="p-4 text-center">조회</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm font-medium">
                  {salaries.map((sal, idx) => {
                    const [y, m] = sal.yearMonth.split('-');
                    return (
                      <tr key={sal.id} className="hover:bg-slate-50/40">
                        <td className="p-4 text-center text-slate-400 text-xs font-bold">{salaries.length - idx}</td>
                        <td className="p-4 font-black text-slate-800">{y}년 {m}월</td>
                        <td className="p-4 text-right font-mono text-slate-600">{sal.totalAllowance.toLocaleString()}원</td>
                        <td className="p-4 text-right font-mono text-rose-500">{sal.totalDeduction.toLocaleString()}원</td>
                        <td className="p-4 text-right font-mono font-black text-indigo-600">{sal.netPay.toLocaleString()}원</td>
                        <td className="p-4 text-center font-mono text-slate-500">{sal.overtimeHours || 0}시간</td>
                        <td className="p-4 text-center">
                          <button 
                            onClick={() => setViewingSalary(sal)}
                            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black rounded-xl transition-all flex items-center gap-1 mx-auto"
                          >
                            <Eye size={13} /> 상세 보기
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 명세서 조회 및 인쇄 모달 */}
      {viewingSalary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 print:relative print:z-0 print:p-0 print:bg-white print:inset-auto print:block">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto relative print:max-h-none print:overflow-visible print:shadow-none print:p-0 print:rounded-none">
            
            <button 
              onClick={() => setViewingSalary(null)}
              className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 print:hidden"
            >
              <X size={18} />
            </button>
            
            <div className="text-center pb-6 border-b border-slate-200 mb-6">
              <h3 className="text-2xl font-black text-slate-900">{viewingSalary.yearMonth.split('-')[0]}년 {viewingSalary.yearMonth.split('-')[1]}월 귀속 급여명세서</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 mb-6 print:bg-white print:border-slate-300">
              <div>성 명: <span className="text-slate-900">{viewingSalary.name}</span></div>
              <div>사원코드: <span className="text-slate-900 font-mono">{viewingSalary.employeeCode || '-'}</span></div>
              <div>회 사: <span className="text-slate-900">{COMPANY_LABELS[userData?.company] || '오성합판'}</span></div>
              <div>소 속: <span className="text-slate-900">{LOCATION_LABELS[userData?.role] || '사원'}</span></div>
              <div>연장근로시간: <span className="text-indigo-600 font-mono">{viewingSalary.overtimeHours || 0} 시간</span></div>
              <div>연차/휴일사용일수: <span className="text-indigo-600 font-mono">{viewingSalary.leaveDaysUsed || 0} 일</span></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
              {/* 지급 */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm print:border-slate-300">
                <div className="bg-indigo-600 text-white px-4 py-2 text-xs font-black print:bg-slate-700 print:text-white">지급 항목</div>
                <div className="p-4 space-y-2 text-xs">
                  <div className="flex justify-between"><span>기본급</span><span className="font-bold">{viewingSalary.baseSalaryNormal.toLocaleString()}원</span></div>
                  {Number(viewingSalary.baseSalaryService) > 0 && (
                    <div className="flex justify-between"><span>근속 기본급</span><span className="font-bold">{viewingSalary.baseSalaryService.toLocaleString()}원</span></div>
                  )}
                  <div className="flex justify-between"><span>주휴수당</span><span className="font-bold">{viewingSalary.weeklyHolidayAllowance.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>식대보조</span><span className="font-bold">{viewingSalary.mealAllowance.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>만근수당</span><span className="font-bold">{viewingSalary.fullAttendanceAllowance.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>연장수당</span><span className="font-bold">{viewingSalary.responsibilityAllowance1.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>연차수당</span><span className="font-bold">{viewingSalary.responsibilityAllowance2.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>비정기 인센티브</span><span className="font-bold">{viewingSalary.irregularIncentive.toLocaleString()}원</span></div>
                  {Number(viewingSalary.bonus) > 0 && (
                    <div className="flex justify-between"><span>상여</span><span className="font-bold">{viewingSalary.bonus.toLocaleString()}원</span></div>
                  )}
                  {Number(viewingSalary.otherAllowance1) > 0 && (
                    <div className="flex justify-between"><span>기타,책임수당</span><span className="font-bold">{viewingSalary.otherAllowance1.toLocaleString()}원</span></div>
                  )}
                  <div className="flex justify-between"><span>자가운전보조</span><span className="font-bold">{viewingSalary.drivingAllowance.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>육아수당</span><span className="font-bold">{viewingSalary.childcareAllowance.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>기타금품</span><span className="font-bold">{viewingSalary.otherAllowance2.toLocaleString()}원</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 font-black text-indigo-600 text-sm print:text-slate-800">
                    <span>지급 합계 (소득총액)</span><span>{viewingSalary.totalAllowance.toLocaleString()}원</span>
                  </div>
                </div>
              </div>
              
              {/* 공제 */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm print:border-slate-300">
                <div className="bg-rose-600 text-white px-4 py-2 text-xs font-black print:bg-slate-700 print:text-white">공제 항목</div>
                <div className="p-4 space-y-2 text-xs">
                  <div className="flex justify-between"><span>국민연금</span><span className="font-bold">{viewingSalary.nationalPension.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>건강보험</span><span className="font-bold">{viewingSalary.healthInsurance.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>장기요양보험</span><span className="font-bold">{viewingSalary.longTermCare.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>고용보험</span><span className="font-bold">{viewingSalary.employmentInsurance.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>소득세</span><span className="font-bold">{viewingSalary.incomeTax.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>주민세</span><span className="font-bold">{viewingSalary.localIncomeTax.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span>가불</span><span className="font-bold">{viewingSalary.advancePayment.toLocaleString()}원</span></div>
                  {Number(viewingSalary.yearEndIncomeTax) > 0 && (
                    <div className="flex justify-between"><span>연말정산소득세</span><span className="font-bold">{viewingSalary.yearEndIncomeTax.toLocaleString()}원</span></div>
                  )}
                  {Number(viewingSalary.yearEndLocalIncomeTax) > 0 && (
                    <div className="flex justify-between"><span>연말정산 주민세</span><span className="font-bold">{viewingSalary.yearEndLocalIncomeTax.toLocaleString()}원</span></div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 font-black text-rose-600 text-sm print:text-slate-800">
                    <span>공제 합계 (공제총액)</span><span>{viewingSalary.totalDeduction.toLocaleString()}원</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 mt-6 space-y-2 text-xs font-bold text-slate-700 print:bg-white print:border-slate-300">
              <div className="flex justify-between"><span>과세 합계:</span><span className="text-slate-900">{viewingSalary.taxableTotal?.toLocaleString() || viewingSalary.totalAllowance.toLocaleString()}원</span></div>
              <div className="flex justify-between"><span>공제액 합계 (가불제외):</span><span className="text-rose-600 print:text-slate-850">{viewingSalary.deductibleTax.toLocaleString()}원</span></div>
              <div className="flex justify-between"><span>실제지급액 (가불포함):</span><span className="text-indigo-600 print:text-slate-850">{viewingSalary.totalAfterTax.toLocaleString()}원</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm text-slate-900 font-black">
                <span>실제지급액 (가불미포함):</span><span className="text-indigo-700 text-base print:text-slate-900">{viewingSalary.netPay.toLocaleString()}원</span>
              </div>
            </div>

            {viewingSalary.individualMemo && (
              <div className="mt-4 p-4 bg-yellow-50 rounded-2xl border border-yellow-250 text-xs font-bold text-yellow-800 print:bg-white print:border-slate-350 print:text-slate-800">
                📌 개별 메모: {viewingSalary.individualMemo}
              </div>
            )}
 
            <div className="hidden print:block text-center mt-12 text-[10px] text-slate-400 border-t border-slate-200 pt-4">
              본 급여명세서는 시스템에서 보안 조회된 인쇄본입니다.<br />
              © {viewingSalary.yearMonth.split('-')[0]} {COMPANY_LABELS[userData?.company] || '오성합판'}. ALL RIGHTS RESERVED.
            </div>
            
            <div className="pt-6 flex justify-end gap-2 print:hidden">
              <button 
                onClick={handlePrint}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1 shadow-md active:scale-95"
              >
                <Printer size={14} /> 명세서 인쇄 (PDF 저장)
              </button>
              <button 
                onClick={() => setViewingSalary(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboard;
