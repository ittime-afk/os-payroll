import React, { useState, useEffect } from 'react';
import { Loader2, UserCircle, Shield, Key, Mail, Lock } from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';

const App = () => {
  // 로그인 유저 및 DB 데이터 상태
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // 로그인 입력 폼 상태
  const [authEmail, setAuthEmail] = useState('');
  const [authPw, setAuthPw] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // 비밀번호 재설정 모달 상태
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [isResetLoading, setIsResetLoading] = useState(false);

  // --- 1. 로그인 상태 모니터링 ---
  useEffect(() => {
    let unsubSnapshot = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setIsLoadingUser(true);
      if (u) {
        try {
          // Firestore의 'users' 컬렉션에서 사용자 문서 조회
          const docSnap = await getDoc(doc(db, 'users', u.uid));
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUser(u);
            setUserData(data);

            // 데이터 실시간 업데이트 반영
            unsubSnapshot = onSnapshot(doc(db, 'users', u.uid), (snap) => {
              if (snap.exists()) {
                setUserData(snap.data());
              }
            });
          } else {
            // Firestore에 사용자 정보가 없는 임시 비가입 상태 대응
            setUser(u);
            setUserData({ name: u.email.split('@')[0], role: 'production', role2: 'STAFF' });
          }
        } catch (e) {
          console.error('사용자 데이터 조회 에러: ', e);
          setUser(u);
          setUserData({ name: u.email.split('@')[0], role: 'production', role2: 'STAFF' });
        }
      } else {
        setUser(null);
        setUserData(null);
        if (unsubSnapshot) {
          unsubSnapshot();
          unsubSnapshot = null;
        }
      }
      setIsLoadingUser(false);
    });

    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  // --- 2. 로그인 및 로그아웃 핸들러 ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError('');

    try {
      await signInWithEmailAndPassword(auth, authEmail, authPw);
    } catch (err) {
      console.error(err);
      let msg = '로그인 정보가 올바르지 않습니다.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = '이메일 또는 비밀번호가 일치하지 않습니다.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = '로그인 시도가 너무 많아 일시적으로 계정이 잠겼습니다. 나중에 다시 시도해 주세요.';
      }
      setAuthError(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      await signOut(auth);
      setAuthEmail('');
      setAuthPw('');
    }
  };

  // --- 3. 비밀번호 재설정 이메일 전송 핸들러 ---
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setIsResetLoading(true);
    setResetMessage('');
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage('비밀번호 재설정 링크가 이메일로 전송되었습니다. 메일함을 확인해 주세요.');
    } catch (err) {
      console.error(err);
      let msg = '비밀번호 재설정 링크 발송에 실패했습니다.';
      if (err.code === 'auth/user-not-found') {
        msg = '해당 이메일로 가입된 회원이 존재하지 않습니다.';
      }
      setResetMessage(msg);
    } finally {
      setIsResetLoading(false);
    }
  };

  // 관리자 권한 판별
  // role이 admin 또는 office이거나, role2가 CEO인 경우 관리자로 간주
  const isAdmin = () => {
    if (!userData) return false;
    const role = (userData.role || '').toLowerCase();
    const role2 = (userData.role2 || '').toUpperCase();
    return role === 'admin' || role === 'office' || role2 === 'CEO';
  };

  // --- 4. 로딩 화면 렌더링 ---
  if (isLoadingUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-black">시스템 보안 접속을 확인 중입니다...</p>
        </div>
      </div>
    );
  }

  // --- 5. 미로그인 상태: 로그인 화면 렌더링 ---
  if (!user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-200 animate-in zoom-in duration-300">
          <div className="text-center mb-8">
            <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
              <UserCircle className="text-white w-10 h-10" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">오성 급여조회 시스템</h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">가입된 급여이메일 계정으로 접속해주세요.</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1">이메일</label>
              <input 
                type="email" 
                placeholder="payroll@example.com" 
                className="w-full p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                value={authEmail} 
                onChange={e => setAuthEmail(e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-bold text-slate-500">비밀번호</label>
                <button 
                  type="button"
                  onClick={() => { setIsForgotModalOpen(true); setResetMessage(''); }}
                  className="text-[10px] font-bold text-indigo-600 hover:underline"
                >
                  비밀번호 찾기
                </button>
              </div>
              <input 
                type="password" 
                placeholder="••••••••" 
                className="w-full p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                value={authPw} 
                onChange={e => setAuthPw(e.target.value)} 
                required 
              />
            </div>
            
            {authError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-xl animate-in fade-in">
                <Shield className="w-4 h-4 shrink-0" />
                <p className="text-xs font-bold">{authError}</p>
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={isAuthLoading} 
              className={`w-full py-4 rounded-xl font-black text-white shadow-lg transition-all flex items-center justify-center gap-2 ${
                isAuthLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-indigo-200'
              }`}
            >
              {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '로그인'}
            </button>
          </form>
        </div>

        {/* --- 비밀번호 재설정 모달 --- */}
        {isForgotModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
              <button 
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"
              >
                ✕
              </button>
              <div className="text-center mb-6">
                <div className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Key size={24} />
                </div>
                <h3 className="text-lg font-black text-slate-800">비밀번호 찾기</h3>
                <p className="text-xs text-slate-400 font-medium mt-1">가입 시 등록된 이메일 주소로<br />비밀번호 재설정 링크를 전송합니다.</p>
              </div>
              
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 ml-1">이메일 주소</label>
                  <input 
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="example@example.com"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {resetMessage && (
                  <p className="text-xs font-bold text-center p-2 rounded-lg bg-indigo-50 text-indigo-700">
                    {resetMessage}
                  </p>
                )}

                <button 
                  type="submit"
                  disabled={isResetLoading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md"
                >
                  {isResetLoading ? '발송 중...' : '재설정 링크 메일 발송'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- 6. 로그인 상태: 권한에 따른 라우팅 렌더링 ---
  return isAdmin() ? (
    <AdminDashboard userData={userData} handleLogout={handleLogout} />
  ) : (
    <UserDashboard user={user} userData={userData} handleLogout={handleLogout} />
  );
};

export default App;
