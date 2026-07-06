import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Download, AlertTriangle, CheckCircle, FileSpreadsheet, Send,
  Trash2, Edit, Eye, Sparkles, Search, Lock, Unlock, X, MessageSquare
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { parsePayrollExcel, downloadPayrollTemplate, getExcelSheetNames } from '../utils/excelUtils';
import { generatePayrollEmailHtml } from '../utils/emailTemplate';

const AdminDashboard = ({ userData, handleLogout, toggleMode }) => {
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });

  // DB 데이터 상태
  const [users, setUsers] = useState([]); // 전체 직원 목록 (매칭용)
  const [savedSalaries, setSavedSalaries] = useState([]); // 저장된 급여 목록
  
  // 엑셀 업로드 상태
  const [excelData, setExcelData] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  
  // 다중 탭(시트) 제어 상태
  const [uploadedFile, setUploadedFile] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');

  // 이메일 공통 메모 상태 (로컬 스토리지 보존)
  const [commonMemo, setCommonMemo] = useState(() => {
    return localStorage.getItem('osung_common_memo') || '';
  });

  const fileInputRef = useRef(null);

  // UI 필터 및 검색
  const [searchTerm, setSearchTerm] = useState('');
  
  // 모달 상태
  const [viewingSalary, setViewingSalary] = useState(null); // 명세서 보기 모달
  const [editingSalary, setEditingSalary] = useState(null); // 수동 수정 모달
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // 이메일 발송 상태
  const [selectedSalaries, setSelectedSalaries] = useState([]); // 다중 선택
  const [sendingEmailIds, setSendingEmailIds] = useState({}); // { docId: true }

  // 부서(role) 및 회사 라벨
  const COMPANY_LABELS = { osung: '오성합판', nbboard: 'nbboard' };
  const LOCATION_LABELS = {
    admin: '관리자', office: '사무실', sales: '영업부', production: '생산팀',
    shipping: '운송팀', forklift: '지게차', pur: 'PUR팀', ovl: 'OVL팀', lpm: 'LPM팀', cnc: 'CNC팀'
  };

  // 공통 메모 저장 핸들러
  const handleCommonMemoChange = (e) => {
    const val = e.target.value;
    setCommonMemo(val);
    localStorage.setItem('osung_common_memo', val);
  };

  // --- 1. 직원 목록 및 급여 목록 가져오기 ---
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(uList);
    });

    return () => unsubUsers();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'salaries'), where('yearMonth', '==', yearMonth));
    const unsubSalaries = onSnapshot(q, (snap) => {
      const sList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSavedSalaries(sList);
    });

    return () => unsubSalaries();
  }, [yearMonth]);

  // --- 2. 엑셀 파일 처리 ---
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleInitialFileLoad(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e) => {
    if (e.target.files && e.target.files[0]) {
      handleInitialFileLoad(e.target.files[0]);
    }
  };

  const handleInitialFileLoad = async (file) => {
    setUploadError('');
    setIsProcessingExcel(true);
    try {
      const sheets = await getExcelSheetNames(file);
      if (!sheets || sheets.length === 0) {
        throw new Error('시트가 비어있는 엑셀 파일입니다.');
      }
      setUploadedFile(file);
      setSheetNames(sheets);
      setSelectedSheet(sheets[0]);
      
      await processFile(file, sheets[0]);
    } catch (err) {
      console.error(err);
      setUploadError('엑셀 파일을 읽는 도중 오류가 발생했습니다. 올바른 엑셀 파일인지 확인해 주세요.');
      setIsProcessingExcel(false);
    }
  };

  const processFile = async (file, sheetName) => {
    setIsProcessingExcel(true);
    try {
      const rows = await parsePayrollExcel(file, sheetName);
      
      // 파싱된 데이터에 직원 DB 매칭 적용 (오직 E열 번호 기준으로만 매칭)
      const matchedRows = rows.map(row => {
        let matchedUser = null;
        if (row.employeeCode) {
          matchedUser = users.find(u => u.employeeCode && String(u.employeeCode).trim() === String(row.employeeCode).trim());
        }

        if (matchedUser) {
          return {
            ...row,
            uid: matchedUser.id,
            email: matchedUser.email || '',
            company: matchedUser.company || 'osung',
            role: matchedUser.role || 'production',
            matchedName: matchedUser.name,
            matchedCode: matchedUser.employeeCode,
            matchStatus: 'matched',
          };
        } else {
          return {
            ...row,
            uid: '',
            matchStatus: 'unmatched',
            validationErrors: [...row.validationErrors, 'DB 직원 검색 실패']
          };
        }
      });

      setExcelData(matchedRows);
    } catch (err) {
      console.error(err);
      setUploadError(`[${sheetName}] 시트 분석에 실패했습니다. 해당 탭의 데이터 규격을 다시 확인해 주세요.`);
    } finally {
      setIsProcessingExcel(false);
    }
  };

  const handleSheetChange = async (e) => {
    const nextSheet = e.target.value;
    setSelectedSheet(nextSheet);
    if (uploadedFile) {
      await processFile(uploadedFile, nextSheet);
    }
  };

  const handleManualMatch = (index, userUid) => {
    const updated = [...excelData];
    const targetUser = users.find(u => u.id === userUid);
    
    if (targetUser) {
      const newErrors = updated[index].validationErrors.filter(e => e !== 'DB 직원 검색 실패');
      
      updated[index] = {
        ...updated[index],
        uid: targetUser.id,
        email: targetUser.email || '',
        company: targetUser.company || 'osung',
        role: targetUser.role || 'production',
        matchedName: targetUser.name,
        matchedCode: targetUser.employeeCode,
        matchStatus: 'manual',
        validationErrors: newErrors,
      };
    } else {
      updated[index] = {
        ...updated[index],
        uid: '',
        matchStatus: 'unmatched',
        validationErrors: [...updated[index].validationErrors.filter(e => e !== 'DB 직원 검색 실패'), 'DB 직원 검색 실패']
      };
    }
    setExcelData(updated);
  };

  const handleSaveExcelData = async () => {
    const unmatchedCount = excelData.filter(d => !d.uid).length;
    if (unmatchedCount > 0) {
      alert('매칭되지 않은 직원이 존재합니다. 직원 정보를 수동으로 연결해 주세요.');
      return;
    }

    if (excelData.some(d => d.validationErrors.length > 0)) {
      if (!window.confirm('정합성 검증 에러가 있는 직원이 있습니다. 그래도 저장하시겠습니까?')) {
        return;
      }
    }

    try {
      setIsProcessingExcel(true);
      for (const row of excelData) {
        const docId = `${row.uid}_${yearMonth}`;
        const salaryDoc = {
          ...row,
          yearMonth,
          status: 'draft',
          sentEmail: false,
          sentAt: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        delete salaryDoc.excelRowIndex;
        delete salaryDoc.matchedName;
        delete salaryDoc.matchedCode;
        delete salaryDoc.matchStatus;
        delete salaryDoc.validationErrors;
        delete salaryDoc.isValid;

        await setDoc(doc(db, 'salaries', docId), salaryDoc);

        const userRef = doc(db, 'users', row.uid);
        const userObj = users.find(u => u.uid === row.uid || u.id === row.uid);
        if (userObj) {
          const updateFields = {};
          if (!userObj.bankName && row.bankName) updateFields.bankName = row.bankName;
          if (!userObj.accountNumber && row.accountNumber) updateFields.accountNumber = row.accountNumber;
          if (!userObj.employeeCode && row.employeeCode) updateFields.employeeCode = row.employeeCode;
          
          if (Object.keys(updateFields).length > 0) {
            await updateDoc(userRef, updateFields);
          }
        }
      }
      
      alert('급여 정보가 성공적으로 등록(임시저장)되었습니다.');
      clearUploadedFile();
    } catch (e) {
      console.error(e);
      alert('급여 등록 도중 오류가 발생했습니다: ' + e.message);
    } finally {
      setIsProcessingExcel(false);
    }
  };

  const clearUploadedFile = () => {
    setExcelData([]);
    setUploadedFile(null);
    setSheetNames([]);
    setSelectedSheet('');
    setUploadError('');
  };

  // --- 3. 급여 상태 및 수정/삭제 액션 ---
  const handleToggleAllStatus = async (newStatus) => {
    if (savedSalaries.length === 0) return;
    const actionText = newStatus === 'published' ? '공개' : '임시저장(비공개)';
    if (!window.confirm(`${yearMonth} 귀속 전체 급여 데이터를 [${actionText}] 상태로 변경하시겠습니까?`)) return;

    try {
      for (const sal of savedSalaries) {
        await updateDoc(doc(db, 'salaries', sal.id), { status: newStatus });
      }
      alert(`성공적으로 [${actionText}] 처리되었습니다.`);
    } catch (e) {
      alert('오류가 발생했습니다: ' + e.message);
    }
  };

  const handleToggleStatus = async (sal) => {
    const nextStatus = sal.status === 'published' ? 'draft' : 'published';
    try {
      await updateDoc(doc(db, 'salaries', sal.id), { status: nextStatus });
    } catch (e) {
      alert('변경 실패: ' + e.message);
    }
  };

  const handleDeleteSalary = async (sal) => {
    if (!window.confirm(`[${sal.name}] 님의 ${yearMonth} 급여 데이터를 정말 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, 'salaries', sal.id));
      alert('삭제 완료');
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  };

  const openEditModal = (sal) => {
    setEditingSalary({ ...sal });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setIsSavingEdit(true);
    
    const baseSalary = Number(editingSalary.baseSalaryNormal) + Number(editingSalary.baseSalaryService);
    const responsibilityAllowance = Number(editingSalary.responsibilityAllowance1) + Number(editingSalary.responsibilityAllowance2);
    const otherAllowance = Number(editingSalary.otherAllowance1) + Number(editingSalary.otherAllowance2);

    const totalAllowance = 
      baseSalary + 
      Number(editingSalary.weeklyHolidayAllowance) + 
      Number(editingSalary.mealAllowance) + 
      Number(editingSalary.fullAttendanceAllowance) + 
      Number(editingSalary.irregularIncentive) + 
      Number(editingSalary.bonus) + 
      Number(editingSalary.drivingAllowance) + 
      Number(editingSalary.childcareAllowance) + 
      otherAllowance;

    const totalDeduction = 
      Number(editingSalary.nationalPension) + 
      Number(editingSalary.healthInsurance) + 
      Number(editingSalary.longTermCare) + 
      Number(editingSalary.employmentInsurance) + 
      Number(editingSalary.incomeTax) + 
      Number(editingSalary.localIncomeTax) + 
      Number(editingSalary.advancePayment) + 
      Number(editingSalary.yearEndIncomeTax) + 
      Number(editingSalary.yearEndLocalIncomeTax);

    const netPay = totalAllowance - totalDeduction;
    const deductibleTax = totalDeduction - Number(editingSalary.advancePayment);
    const totalAfterTax = totalAllowance - deductibleTax;

    try {
      await updateDoc(doc(db, 'salaries', editingSalary.id), {
        ...editingSalary,
        baseSalary,
        responsibilityAllowance,
        otherAllowance,
        totalAllowance,
        totalDeduction,
        netPay,
        deductibleTax,
        totalAfterTax,
        updatedAt: new Date().toISOString()
      });
      alert('급여 내역이 수정되었습니다.');
      setEditingSalary(null);
    } catch (err) {
      alert('수정 실패: ' + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // --- 4. 이메일 발송 처리 (공통 메모 전달 연계) ---
  const handleSendEmail = async (sal) => {
    if (!sal.email) {
      alert('직원의 이메일 정보가 등록되어 있지 않습니다. 직원 관리에서 이메일을 추가해 주세요.');
      return;
    }

    if (sal.status === 'draft') {
      if (!window.confirm('현재 급여 내역이 [임시저장] 상태입니다. 그래도 메일을 발송하시겠습니까?')) {
        return;
      }
    } else {
      if (!window.confirm(`[${sal.name}] 님에게 급여명세서 메일을 발송하시겠습니까?`)) {
        return;
      }
    }

    setSendingEmailIds(prev => ({ ...prev, [sal.id]: true }));
    
    try {
      const userObj = users.find(u => u.id === sal.uid);
      const companyLabel = COMPANY_LABELS[userObj?.company] || '오성합판';
      const roleLabel = LOCATION_LABELS[userObj?.role] || '사원';
      
      const emailHtml = generatePayrollEmailHtml(sal, companyLabel, roleLabel, commonMemo);
      const [y, m] = yearMonth.split('-');

      await addDoc(collection(db, 'mail'), {
        to: sal.email,
        message: {
          subject: `[급여명세서] ${y}년 ${m}월 귀속 급여명세서입니다. (${sal.name} 님)`,
          html: emailHtml
        }
      });

      await updateDoc(doc(db, 'salaries', sal.id), {
        sentEmail: true,
        sentAt: new Date().toISOString()
      });

      alert(`[${sal.name}] 님에게 급여명세서 이메일을 발송 요청 완료했습니다.`);
    } catch (e) {
      console.error(e);
      alert('이메일 전송에 실패했습니다: ' + e.message);
    } finally {
      setSendingEmailIds(prev => ({ ...prev, [sal.id]: false }));
    }
  };

  const handleSendSelectedEmails = async () => {
    if (selectedSalaries.length === 0) {
      alert('발송할 대상을 선택해 주세요.');
      return;
    }

    const itemsToSend = savedSalaries.filter(s => selectedSalaries.includes(s.id));
    const noEmailItems = itemsToSend.filter(s => !s.email);
    
    if (noEmailItems.length > 0) {
      alert(`이메일 정보가 없는 직원(${noEmailItems.map(s => s.name).join(', ')})이 포함되어 있습니다. 제외하고 진행해주세요.`);
      return;
    }

    if (!window.confirm(`선택한 ${itemsToSend.length}명의 직원에게 급여명세서 메일을 순차 발송하시겠습니까?`)) {
      return;
    }

    let successCount = 0;
    
    for (const sal of itemsToSend) {
      setSendingEmailIds(prev => ({ ...prev, [sal.id]: true }));
      try {
        const userObj = users.find(u => u.id === sal.uid);
        const companyLabel = COMPANY_LABELS[userObj?.company] || '오성합판';
        const roleLabel = LOCATION_LABELS[userObj?.role] || '사원';
        
        const emailHtml = generatePayrollEmailHtml(sal, companyLabel, roleLabel, commonMemo);
        const [y, m] = yearMonth.split('-');

        await addDoc(collection(db, 'mail'), {
          to: sal.email,
          message: {
            subject: `[급여명세서] ${y}년 ${m}월 귀속 급여명세서입니다. (${sal.name} 님)`,
            html: emailHtml
          }
        });

        await updateDoc(doc(db, 'salaries', sal.id), {
          sentEmail: true,
          sentAt: new Date().toISOString()
        });
        successCount++;
      } catch (err) {
        console.error(err);
      } finally {
        setSendingEmailIds(prev => ({ ...prev, [sal.id]: false }));
      }
    }

    alert(`총 ${successCount}명에게 급여명세서 메일을 성공적으로 발송 요청하였습니다.`);
    setSelectedSalaries([]);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedSalaries(filteredSavedSalaries.map(s => s.id));
    } else {
      setSelectedSalaries([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedSalaries(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // --- 직원코드(employeeCode) 순으로 정렬하여 필터링된 대장 출력 ---
  const filteredSavedSalaries = savedSalaries
    .filter(sal => 
      sal.name.includes(searchTerm) || 
      (sal.employeeCode && sal.employeeCode.includes(searchTerm))
    )
    .sort((a, b) => {
      const codeA = String(a.employeeCode || '').trim();
      const codeB = String(b.employeeCode || '').trim();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });

  // 합계 연산 헬퍼
  const calculateTotalSum = (dataset, key) => {
    return dataset.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-12">
      <div className="fixed top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500 z-50"></div>
      
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 md:px-8 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-100 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <span className="font-black text-xl tracking-tight text-slate-800">오성 급여관리 시스템</span>
            <span 
              onClick={toggleMode}
              title="클릭 시 일반 사원 모드로 전환하여 내 급여명세서를 확인합니다."
              className="cursor-pointer text-[10px] px-2 py-0.5 rounded-full border border-indigo-200 text-indigo-750 bg-indigo-50 hover:bg-indigo-100 transition-all font-bold ml-2 hidden sm:inline-block select-none"
            >
              관리자 모드 🔄
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-400 tracking-widest">Signed In As</span>
            <span className="text-sm font-black text-slate-800 flex items-center gap-1.5">
              {userData?.name || '관리자'}
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 border text-slate-500">사무실</span>
            </span>
          </div>
          <button onClick={handleLogout} className="px-3 py-1.5 border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold text-xs">
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-[100vw] overflow-x-hidden space-y-6">
        
        {/* 컨트롤 패널 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 max-w-7xl mx-auto">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="text-yellow-500 fill-yellow-500 w-5 h-5" /> 급여 귀속 설정 및 업로드
            </h2>
            <p className="text-xs text-slate-400 font-medium">관리 대상 월을 변경하고 엑셀 파일을 업로드합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input 
              type="month" 
              value={yearMonth} 
              onChange={(e) => { setYearMonth(e.target.value); clearUploadedFile(); }}
              className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button 
              onClick={downloadPayrollTemplate}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" /> 표준 양식(이중헤더) 다운로드
            </button>
          </div>
        </div>

        {/* 엑셀 드롭 업로드 */}
        {excelData.length === 0 ? (
          <div className="max-w-7xl mx-auto w-full">
            <div 
              onDragEnter={handleDrag} 
              onDragOver={handleDrag} 
              onDragLeave={handleDrag} 
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all ${
                dragActive ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]' : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileInput} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
              <div className="max-w-md mx-auto space-y-4">
                <div className="bg-indigo-50 text-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-md">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-800">이중 헤더 급여 엑셀 파일 업로드</h3>
                  <p className="text-xs text-slate-400 font-medium">오성 급여 명세 이미지 구조의 엑셀 파일을 이곳에 드래그하거나 선택하여 주십시오.</p>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingExcel}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg shadow-indigo-100 transition-all active:scale-95"
                >
                  {isProcessingExcel ? '파일 분석 중...' : '파일 선택하기'}
                </button>
                {uploadError && <p className="text-red-500 text-xs font-bold mt-2">{uploadError}</p>}
              </div>
            </div>
          </div>
        ) : (
          /* 1. 엑셀 업로드 미리보기 (이메일, 예금주, 계좌 왼쪽 전진 배치 및 Sticky 합계 고정) */
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in zoom-in-95 duration-300 w-full">
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div>
                  <h3 className="text-base font-black text-slate-800">엑셀 업로드 상세 검증 미리보기 ({yearMonth})</h3>
                  <p className="text-[11px] text-slate-400 font-medium">선택하신 시트의 급여 데이터가 아래 나열됩니다.</p>
                </div>
                {sheetNames.length > 1 && (
                  <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5 shrink-0">
                    <span className="text-[10.5px] font-black text-indigo-700">가져올 탭(시트) 선택:</span>
                    <select 
                      value={selectedSheet}
                      onChange={handleSheetChange}
                      className="bg-white border border-indigo-200 text-xs font-bold rounded-lg px-2 py-1 text-slate-800 focus:outline-none"
                    >
                      {sheetNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={clearUploadedFile}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl"
                >
                  취소
                </button>
                <button 
                  onClick={handleSaveExcelData}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md"
                >
                  데이터 저장 (임시저장 등록)
                </button>
              </div>
            </div>
            
            {/* 세로 스크롤 시 Sticky Bottom 고정이 작동하도록 max-height 및 overflow 속성 부여 */}
            <div className="overflow-auto w-full max-h-[600px] relative">
              <table className="table-layout-fixed min-w-[3000px] w-full border-collapse text-[11.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-500 border-b border-slate-200 text-center font-black h-9 sticky top-0 bg-slate-100 z-20">
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[40px]">행</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[120px]">소득자명단<br/>(성명)</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[80px]">직원코드</th>
                    
                    {/* 이메일, 예금주, 계좌 정보 전진 배치 */}
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[120px]">이메일</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[80px]">예금주</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[160px]">은행 및<br/>계좌번호</th>
                    
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[70px]">매칭 상태</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[130px]">수동 매칭 연결</th>
                    
                    {/* 지급 항목 */}
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">보통기본급</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">근속기본급</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">주휴수당</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">식대보조</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">만근수당</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[95px] text-right">연장수당</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[95px] text-right">연차수당</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[95px] text-right">비정기<br/>인센티브</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">상여</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[95px] text-right">기타,책임수당</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[85px] text-right">자가운전<br/>보조</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">육아수당</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[90px] text-right">기타금품</th>
                    
                    {/* 소득총액 */}
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-indigo-50 text-indigo-700 w-[105px] text-right">소득총액</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[85px] text-right">과세합계</th>
                    
                    {/* 공제 항목 */}
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">국민연금</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">건강보험</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">장기요양</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">고용보험</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">소득세</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">주민세</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[85px] text-right">연말정산<br/>소득세</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[85px] text-right">연말정산<br/>주민세</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">가불</th>
                    
                    {/* 최종액 */}
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-100 text-rose-800 w-[105px] text-right">공제총액<br/>(가불포함)</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 bg-green-50 text-green-700 w-[105px] text-right">실제지급<br/>(가불미포)</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[105px] text-right">공제액<br/>(가불제외)</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[105px] text-right">실제지급<br/>(가불포함)</th>
                    
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[70px]">연장<br/>시간</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[70px]">연차/휴일<br/>사용일수</th>
                    <th className="px-1.5 py-1 border-r border-slate-200 w-[150px]">개별 메모</th>
                    <th className="px-1.5 py-1 w-[160px]">검증 결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {excelData.map((row, idx) => (
                    <tr key={idx} className={`h-7 hover:bg-slate-50/50 ${row.isValid ? '' : 'bg-red-50/30'}`}>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center text-slate-400 font-mono">{row.excelRowIndex}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 font-black text-slate-800 text-center">{row.name}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 font-mono text-slate-500 text-center">{row.employeeCode || '-'}</td>
                      
                      {/* 전진 배치 데이터 */}
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-slate-400 truncate" title={row.email}>{row.email || '-'}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 truncate text-center">{row.accountHolder}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-slate-500 font-mono truncate">{row.bankName} {row.accountNumber}</td>
                      
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center">
                        <span className={`px-1 py-0.25 rounded text-[9.5px] font-bold border ${
                          row.matchStatus === 'matched' ? 'bg-green-50 text-green-700 border-green-200' :
                          row.matchStatus === 'manual' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {row.matchStatus === 'matched' ? '성공' :
                           row.matchStatus === 'manual' ? '수동' : '실패'}
                        </span>
                      </td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200">
                        <select 
                          value={row.uid}
                          onChange={(e) => handleManualMatch(idx, e.target.value)}
                          className="bg-white border border-slate-200 text-[10.5px] rounded p-0.25 w-full focus:outline-none"
                        >
                          <option value="">-- 수동 선택 --</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>
                              [{u.employeeCode}] {u.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      
                      {/* 지급 */}
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.baseSalaryNormal.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.baseSalaryService.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.weeklyHolidayAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.mealAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.fullAttendanceAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.responsibilityAllowance1.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.responsibilityAllowance2.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.irregularIncentive.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.bonus.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.otherAllowance1.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.drivingAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.childcareAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.otherAllowance2.toLocaleString()}</td>
                      
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono font-bold text-indigo-700 bg-indigo-50/40">{row.totalAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono text-slate-600">{row.taxableTotal.toLocaleString()}</td>
                      
                      {/* 공제 */}
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.nationalPension.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.healthInsurance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.longTermCare.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.employmentInsurance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.incomeTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.localIncomeTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.yearEndIncomeTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{row.yearEndLocalIncomeTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono text-rose-600">{row.advancePayment.toLocaleString()}</td>
                      
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono font-bold text-rose-800 bg-rose-50/40">{row.totalDeduction.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono font-black text-indigo-700 bg-green-50/30">{row.netPay.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono text-rose-700 font-bold">{row.deductibleTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono text-slate-700">{row.totalAfterTax.toLocaleString()}</td>
                      
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center font-mono">{row.overtimeHours}시간</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center font-mono">{row.leaveDaysUsed}일</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-slate-500 truncate font-semibold" title={row.individualMemo}>{row.individualMemo || '-'}</td>
                      <td className="px-1.5 py-0.5 truncate font-semibold">
                        {row.validationErrors && row.validationErrors.length > 0 ? (
                          <span className="text-red-500 flex items-center gap-1" title={row.validationErrors.join(', ')}>
                            <AlertTriangle size={11} className="shrink-0" /> {row.validationErrors[0]}
                          </span>
                        ) : (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle size={11} className="shrink-0" /> 검증완료
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* 엑셀 업로드 미리보기 합계 행 (Sticky 하단 고정 적용) */}
                <tfoot className="sticky bottom-0 z-20 shadow-[0_-3px_8px_rgba(0,0,0,0.08)]">
                  <tr className="bg-slate-200 text-slate-800 font-black h-8 text-right border-t border-slate-350">
                    <td colSpan="8" className="text-center p-1.5 bg-slate-250 border-r border-slate-300">합 계</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'baseSalaryNormal').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'baseSalaryService').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'weeklyHolidayAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'mealAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'fullAttendanceAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'responsibilityAllowance1').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'responsibilityAllowance2').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'irregularIncentive').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'bonus').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'otherAllowance1').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'drivingAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'childcareAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'otherAllowance2').toLocaleString()}</td>
                    
                    <td className="p-1.5 border-r border-slate-300 font-mono text-indigo-850 bg-indigo-100">{calculateTotalSum(excelData, 'totalAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'taxableTotal').toLocaleString()}</td>
                    
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'nationalPension').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'healthInsurance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'longTermCare').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'employmentInsurance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'incomeTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'localIncomeTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'yearEndIncomeTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(excelData, 'yearEndLocalIncomeTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200 text-rose-700">{calculateTotalSum(excelData, 'advancePayment').toLocaleString()}</td>
                    
                    <td className="p-1.5 border-r border-slate-300 font-mono text-rose-850 bg-rose-100">{calculateTotalSum(excelData, 'totalDeduction').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono text-indigo-850 bg-green-100">{calculateTotalSum(excelData, 'netPay').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono text-rose-800 bg-slate-200">{calculateTotalSum(excelData, 'deductibleTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono text-slate-800 bg-slate-200">{calculateTotalSum(excelData, 'totalAfterTax').toLocaleString()}</td>
                    
                    <td className="p-1.5 border-r border-slate-300 text-center font-mono bg-slate-200">{calculateTotalSum(excelData, 'overtimeHours')}H</td>
                    <td className="p-1.5 border-r border-slate-300 text-center font-mono bg-slate-200">{calculateTotalSum(excelData, 'leaveDaysUsed')}일</td>
                    <td colSpan="2" className="bg-slate-200"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* 이메일 발송용 공통 메모(전체 공지) 및 일괄제어 패널 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm max-w-7xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-indigo-700 font-black text-sm">
            <MessageSquare size={16} /> 명세서 이메일 발송 옵션 (공통 메모)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs text-slate-500 font-bold">이메일 본문 하단에 삽입될 공통 공지사항 (모든 수신자에게 공통 전송)</label>
              <textarea 
                rows="2"
                placeholder="예: 이번 달은 상반기 특별 노고에 감사하며 성과 보너스가 포함되었습니다. 노고에 감사드립니다."
                value={commonMemo}
                onChange={handleCommonMemoChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
              />
            </div>
            <div className="flex gap-2 w-full justify-end h-10">
              <button 
                onClick={handleSendSelectedEmails}
                disabled={selectedSalaries.length === 0}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95"
              >
                <Send size={13} /> 선택 발송 ({selectedSalaries.length}명)
              </button>
            </div>
          </div>
        </div>

        {/* 2. 기존 등록된 급여 대장 (직원코드 순, 이메일/계좌 왼쪽 전진 배치 및 Sticky 합계 고정) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden w-full">
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 max-w-7xl mx-auto">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
                {yearMonth} 귀속 등록 급여 대장 명단 (직원코드 순)
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-bold">총 {savedSalaries.length}명</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">DB에 등록된 급여 대장입니다. 가로로 스크롤하여 대조해 보실 수 있습니다.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="이름/코드 검색"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 w-36"
                />
              </div>
              <button 
                onClick={() => handleToggleAllStatus('published')}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center gap-1 transition-all"
              >
                <Unlock size={12} /> 전체공개
              </button>
              <button 
                onClick={() => handleToggleAllStatus('draft')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 transition-all"
              >
                <Lock size={12} /> 전체비공개
              </button>
            </div>
          </div>

          <div className="overflow-auto w-full max-h-[600px] relative">
            <table className="table-layout-fixed min-w-[3000px] w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="bg-slate-100 text-slate-500 border-b border-slate-200 text-center font-black h-9 sticky top-0 bg-slate-100 z-20">
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[40px]">
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll}
                      checked={filteredSavedSalaries.length > 0 && selectedSalaries.length === filteredSavedSalaries.length}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                    />
                  </th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[80px]">직원코드</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[110px]">소득자명단<br/>(성명)</th>
                  
                  {/* 이메일, 예금주, 계좌 정보 전진 배치 */}
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[120px]">이메일</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[80px]">예금주</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[160px]">은행 및<br/>계좌번호</th>
                  
                  {/* 지급 항목 */}
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">보통기본급</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">근속기본급</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">주휴수당</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">식대보조</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">만근수당</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[95px] text-right">연장수당</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[95px] text-right">연차수당</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[95px] text-right">비정기<br/>인센티브</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">상여</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[95px] text-right">기타,책임수당</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[85px] text-right">자가운전<br/>보조</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[80px] text-right">육아수당</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-blue-50 text-blue-700 w-[90px] text-right">기타금품</th>
                  
                  {/* 지급 합계 */}
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-indigo-50 text-indigo-700 w-[105px] text-right">소득총액</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[85px] text-right">과세합계</th>
                  
                  {/* 공제 항목 */}
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">국민연금</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">건강보험</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">장기요양</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">고용보험</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">소득세</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">주민세</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[85px] text-right">연말정산<br/>소득세</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[85px] text-right">연말정산<br/>주민세</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-50 text-rose-700 w-[80px] text-right">가불</th>
                  
                  {/* 공제 합계 및 최종 */}
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-rose-100 text-rose-800 w-[105px] text-right">공제총액<br/>(가불포함)</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 bg-green-50 text-green-700 w-[105px] text-right">실제지급<br/>(가불미포)</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[105px] text-right">공제액<br/>(가불제외)</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[105px] text-right">실제지급<br/>(가불포함)</th>
                  
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[70px]">연장<br/>시간</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[70px]">연차사용<br/>일수</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[60px]">공개</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[80px]">메일</th>
                  <th className="px-1.5 py-1 border-r border-slate-200 w-[150px]">개별 메모</th>
                  <th className="px-1.5 py-1 w-[100px]">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSavedSalaries.length === 0 ? (
                  <tr>
                    <td colSpan="40" className="p-12 text-center text-slate-400 font-semibold bg-slate-50/20">
                      등록된 급여 정보가 없거나 검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredSavedSalaries.map((sal) => (
                    <tr key={sal.id} className="h-7 hover:bg-slate-50/40">
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedSalaries.includes(sal.id)}
                          onChange={() => handleSelectOne(sal.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                        />
                      </td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 font-mono text-slate-500 text-center">{sal.employeeCode || '-'}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 font-black text-slate-800 text-center">{sal.name}</td>
                      
                      {/* 전진 배치 데이터 */}
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-slate-400 truncate" title={sal.email}>{sal.email || '-'}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 truncate text-center">{sal.accountHolder || '-'}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-slate-500 font-mono truncate">{sal.bankName} {sal.accountNumber || '-'}</td>
                      
                      {/* 지급 */}
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.baseSalaryNormal.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.baseSalaryService.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.weeklyHolidayAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.mealAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.fullAttendanceAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.responsibilityAllowance1.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.responsibilityAllowance2.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.irregularIncentive.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.bonus.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.otherAllowance1.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.drivingAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.childcareAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.otherAllowance2.toLocaleString()}</td>
                      
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono font-bold text-indigo-700 bg-indigo-50/40">{sal.totalAllowance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono text-slate-600">{sal.taxableTotal?.toLocaleString() || sal.totalAllowance.toLocaleString()}</td>
                      
                      {/* 공제 */}
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.nationalPension.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.healthInsurance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.longTermCare.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.employmentInsurance.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.incomeTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.localIncomeTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.yearEndIncomeTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono">{sal.yearEndLocalIncomeTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono text-rose-600">{sal.advancePayment.toLocaleString()}</td>
                      
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono font-bold text-rose-800 bg-rose-50/40">{sal.totalDeduction.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono font-black text-indigo-700 bg-green-50/30">{sal.netPay.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono text-rose-700 font-bold">{sal.deductibleTax.toLocaleString()}</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-right font-mono text-slate-700">{sal.totalAfterTax.toLocaleString()}</td>
                      
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center font-mono">{sal.overtimeHours || 0}H</td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center font-mono">{sal.leaveDaysUsed || 0}일</td>
                      
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center">
                        <button 
                          onClick={() => handleToggleStatus(sal)}
                          className={`px-1 py-0.25 rounded text-[9px] font-bold border transition-all ${
                            sal.status === 'published' 
                              ? 'bg-green-50 text-green-700 border-green-200' 
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {sal.status === 'published' ? '공개' : '임시'}
                        </button>
                      </td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-center">
                        {sal.sentEmail ? (
                          <span className="text-[9.5px] font-black text-blue-600">완료</span>
                        ) : (
                          <span className="text-[9.5px] text-slate-400">미발송</span>
                        )}
                      </td>
                      <td className="px-1.5 py-0.5 border-r border-slate-200 text-slate-500 font-semibold truncate" title={sal.individualMemo}>{sal.individualMemo || '-'}</td>
                      <td className="px-1.5 py-0.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewingSalary(sal)} className="p-0.5 text-slate-400 hover:text-indigo-600" title="조회">
                            <Eye size={12} />
                          </button>
                          <button onClick={() => openEditModal(sal)} className="p-0.5 text-slate-400 hover:text-blue-600" title="수정">
                            <Edit size={12} />
                          </button>
                          <button onClick={() => handleSendEmail(sal)} className="p-0.5 text-slate-400 hover:text-rose-600" title="메일">
                            <Send size={12} />
                          </button>
                          <button onClick={() => handleDeleteSalary(sal)} className="p-0.5 text-slate-400 hover:text-red-600" title="삭제">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* 기존 등록대장 합계 행 (Sticky 하단 고정 적용) */}
              {filteredSavedSalaries.length > 0 && (
                <tfoot className="sticky bottom-0 z-20 shadow-[0_-3px_8px_rgba(0,0,0,0.08)]">
                  <tr className="bg-slate-200 text-slate-800 font-black h-8 text-right border-t border-slate-350">
                    <td colSpan="6" className="text-center p-1.5 bg-slate-250 border-r border-slate-300">합 계</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'baseSalaryNormal').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'baseSalaryService').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'weeklyHolidayAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'mealAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'fullAttendanceAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'responsibilityAllowance1').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'responsibilityAllowance2').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'irregularIncentive').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'bonus').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'otherAllowance1').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'drivingAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'childcareAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'otherAllowance2').toLocaleString()}</td>
                    
                    <td className="p-1.5 border-r border-slate-300 font-mono text-indigo-850 bg-indigo-100">{calculateTotalSum(filteredSavedSalaries, 'totalAllowance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'taxableTotal').toLocaleString()}</td>
                    
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'nationalPension').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'healthInsurance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'longTermCare').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'employmentInsurance').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'incomeTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'localIncomeTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'yearEndIncomeTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'yearEndLocalIncomeTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono bg-slate-200 text-rose-700">{calculateTotalSum(filteredSavedSalaries, 'advancePayment').toLocaleString()}</td>
                    
                    <td className="p-1.5 border-r border-slate-300 font-mono text-rose-850 bg-rose-100">{calculateTotalSum(filteredSavedSalaries, 'totalDeduction').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono text-indigo-850 bg-green-100">{calculateTotalSum(filteredSavedSalaries, 'netPay').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono text-rose-800 bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'deductibleTax').toLocaleString()}</td>
                    <td className="p-1.5 border-r border-slate-300 font-mono text-slate-800 bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'totalAfterTax').toLocaleString()}</td>
                    
                    <td className="p-1.5 border-r border-slate-300 text-center font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'overtimeHours')}H</td>
                    <td className="p-1.5 border-r border-slate-300 text-center font-mono bg-slate-200">{calculateTotalSum(filteredSavedSalaries, 'leaveDaysUsed')}일</td>
                    <td colSpan="4" className="bg-slate-200"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>

      {/* --- 모달 1: 상세 명세서 보기 모달 --- */}
      {viewingSalary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto relative">
            <button 
              onClick={() => setViewingSalary(null)}
              className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"
            >
              ✕
            </button>
            
            <div className="text-center pb-6 border-b border-slate-100 mb-6">
              <h3 className="text-2xl font-black text-slate-900">{yearMonth.split('-')[0]}년 {yearMonth.split('-')[1]}월 귀속 급여명세서</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 mb-6">
              <div>성 명: <span className="text-slate-900">{viewingSalary.name}</span></div>
              <div>사원코드: <span className="text-slate-900 font-mono">{viewingSalary.employeeCode || '-'}</span></div>
              <div>회 사: <span className="text-slate-900">{COMPANY_LABELS[users.find(u => u.id === viewingSalary.uid)?.company] || '오성합판'}</span></div>
              <div>소 속: <span className="text-slate-900">{LOCATION_LABELS[users.find(u => u.id === viewingSalary.uid)?.role] || '사원'}</span></div>
              <div>연장근로: <span className="text-indigo-600 font-mono">{viewingSalary.overtimeHours || 0} 시간</span></div>
              <div>연차/휴일사용: <span className="text-indigo-600 font-mono">{viewingSalary.leaveDaysUsed || 0} 일</span></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-indigo-600 text-white px-4 py-2 text-xs font-black">지급 항목</div>
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
                  <div className="flex justify-between border-t border-slate-200 pt-2 font-black text-indigo-600 text-sm">
                    <span>지급 합계</span><span>{viewingSalary.totalAllowance.toLocaleString()}원</span>
                  </div>
                </div>
              </div>
              
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-rose-600 text-white px-4 py-2 text-xs font-black">공제 항목</div>
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
                  <div className="flex justify-between border-t border-slate-200 pt-2 font-black text-rose-600 text-sm">
                    <span>공제 합계</span><span>{viewingSalary.totalDeduction.toLocaleString()}원</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 mt-6 space-y-2 text-xs font-bold text-slate-700">
              <div className="flex justify-between"><span>과세 합계:</span><span className="text-slate-900">{viewingSalary.taxableTotal?.toLocaleString() || viewingSalary.totalAllowance.toLocaleString()}원</span></div>
              <div className="flex justify-between"><span>공제액 합계 (가불제외):</span><span className="text-rose-600">{viewingSalary.deductibleTax.toLocaleString()}원</span></div>
              <div className="flex justify-between"><span>실제지급액 (가불포함):</span><span className="text-indigo-600">{viewingSalary.totalAfterTax.toLocaleString()}원</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm text-slate-900 font-black">
                <span>실제지급액 (가불미포함):</span><span className="text-indigo-750 text-base">{viewingSalary.netPay.toLocaleString()}원</span>
              </div>
            </div>

            {viewingSalary.individualMemo && (
              <div className="mt-4 p-4 bg-yellow-50 rounded-2xl border border-yellow-250 text-xs font-bold text-yellow-800">
                📌 개별 메모: {viewingSalary.individualMemo}
              </div>
            )}
            
            <div className="pt-6 flex justify-end">
              <button 
                onClick={() => setViewingSalary(null)}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 모달 2: 개별 급여 항목 수정 모달 (개별 메모 수정 지원) --- */}
      {editingSalary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto relative">
            <button 
              onClick={() => setEditingSalary(null)}
              className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"
            >
              ✕
            </button>

            <div className="pb-4 border-b border-slate-100 mb-6">
              <h3 className="text-xl font-black text-slate-900">급여 상세 수정</h3>
              <p className="text-xs text-slate-400 font-medium mt-1">[{editingSalary.name}] 님의 상세 내역을 직접 수정합니다.</p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">
                <div className="space-y-1">
                  <label className="text-slate-500">연장근로시간 (시간)</label>
                  <input 
                    type="number"
                    value={editingSalary.overtimeHours}
                    onChange={(e) => setEditingSalary({ ...editingSalary, overtimeHours: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1 text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">연차/휴일사용일수 (일)</label>
                  <input 
                    type="number"
                    value={editingSalary.leaveDaysUsed}
                    onChange={(e) => setEditingSalary({ ...editingSalary, leaveDaysUsed: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1 text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-bold">개별 메모 (이메일 및 사원 대시보드에 개별 노출)</label>
                <input 
                  type="text"
                  value={editingSalary.individualMemo || ''}
                  onChange={(e) => setEditingSalary({ ...editingSalary, individualMemo: e.target.value })}
                  placeholder="예: 야근수당 특별 추가분 포함"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block">지급 항목</h4>
                  {[
                    ['baseSalaryNormal', '보통 기본급'],
                    ['baseSalaryService', '근속 기본급'],
                    ['weeklyHolidayAllowance', '주휴수당'],
                    ['mealAllowance', '식대보조'],
                    ['fullAttendanceAllowance', '만근수당'],
                    ['responsibilityAllowance1', '연장수당'],
                    ['responsibilityAllowance2', '연차수당'],
                    ['irregularIncentive', '비정기 인센티브'],
                    ['bonus', '상여'],
                    ['otherAllowance1', '기타,책임수당'],
                    ['drivingAllowance', '자가운전보조'],
                    ['childcareAllowance', '육아수당'],
                    ['otherAllowance2', '기타금품']
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
                      <label className="w-[120px] truncate">{label}</label>
                      <input 
                        type="number"
                        value={editingSalary[key] || 0}
                        onChange={(e) => setEditingSalary({ ...editingSalary, [key]: Number(e.target.value) })}
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-right font-mono font-bold text-slate-800 w-[120px]"
                      />
                    </div>
                  ))}
                  
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-indigo-600 pt-2 border-t">
                    <label>과세합계</label>
                    <input 
                      type="number"
                      value={editingSalary.taxableTotal || 0}
                      onChange={(e) => setEditingSalary({ ...editingSalary, taxableTotal: Number(e.target.value) })}
                      className="bg-indigo-50/50 border border-indigo-200 rounded px-2 py-1 text-right font-mono font-bold w-[120px] text-indigo-700"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded inline-block">공제 항목</h4>
                  {[
                    ['nationalPension', '국민연금'],
                    ['healthInsurance', '건강보험'],
                    ['longTermCare', '장기요양보험'],
                    ['employmentInsurance', '고용보험'],
                    ['incomeTax', '소득세'],
                    ['localIncomeTax', '주민세'],
                    ['advancePayment', '가불'],
                    ['yearEndIncomeTax', '연말정산소득세'],
                    ['yearEndLocalIncomeTax', '연말정산 주민세']
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
                      <label className="w-[120px] truncate">{label}</label>
                      <input 
                        type="number"
                        value={editingSalary[key] || 0}
                        onChange={(e) => setEditingSalary({ ...editingSalary, [key]: Number(e.target.value) })}
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-right font-mono font-bold text-slate-800 w-[120px]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button 
                  type="button"
                  onClick={() => setEditingSalary(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl"
                >
                  취소
                </button>
                <button 
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSavingEdit ? '저장 중...' : '급여 수정 적용'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
