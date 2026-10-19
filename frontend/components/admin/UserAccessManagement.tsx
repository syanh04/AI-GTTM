'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { KeyRound, Lock, Save, ShieldCheck, Trash2, Unlock, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

type Role = 'admin' | 'operator' | 'viewer' | 'user';

interface AccessUser {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  created_at?: string | null;
}

const roleLabels: Record<Role, string> = {
  admin: 'Quản trị',
  operator: 'Vận hành',
  viewer: 'Người xem',
  user: 'Người dùng',
};

const roleScopes: Record<Role, string> = {
  admin: 'Toàn hệ thống',
  operator: 'Giám sát, duyệt vi phạm, báo cáo',
  viewer: 'Chỉ xem dashboard và báo cáo',
  user: 'Quyền cơ bản',
};

function makeAuthHeaders(json = true) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

export default function UserAccessManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [roleEdit, setRoleEdit] = useState<AccessUser | null>(null);
  const [roleDraft, setRoleDraft] = useState<Role>('operator');
  const [passwordEdit, setPasswordEdit] = useState<AccessUser | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AccessUser | null>(null);

  const activeCount = useMemo(() => users.filter((item) => item.is_active).length, [users]);

  const loadUsers = async () => {
    setError('');
    try {
      const res = await fetch('/api/auth/users', {
        headers: makeAuthHeaders(false),
      });
      if (!res.ok) throw new Error(await res.text());
      setUsers(await res.json());
    } catch (err) {
      setError('Không tải được danh sách tài khoản. Vui lòng kiểm tra quyền admin và backend.');
      console.error(err);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const createAccount = async () => {
    setLoading(true);
    setNotice('');
    setError('');
    try {
      const cleanUsername = username.trim();
      if (cleanUsername.length < 3) throw new Error('Tên đăng nhập phải có ít nhất 3 ký tự.');
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({
          username: cleanUsername,
          password: password.trim() || undefined,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Không tạo được tài khoản.');
      setNotice(`Đã tạo tài khoản ${data.username}. Mật khẩu tạm: ${data.temporary_password}`);
      setUsername('');
      setPassword('');
      setRole('operator');
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Không tạo được tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const saveRole = async () => {
    if (!roleEdit) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/auth/users/${roleEdit.id}/role`, {
        method: 'PATCH',
        headers: makeAuthHeaders(),
        body: JSON.stringify({ role: roleDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Không sửa được quyền.');
      setNotice(`Đã cập nhật quyền cho ${roleEdit.username}.`);
      setRoleEdit(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Không sửa được quyền.');
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async () => {
    if (!passwordEdit) return;
    setLoading(true);
    setError('');
    try {
      if (passwordDraft.length < 8) throw new Error('Mật khẩu phải có ít nhất 8 ký tự.');
      const res = await fetch(`/api/auth/users/${passwordEdit.id}/password`, {
        method: 'PATCH',
        headers: makeAuthHeaders(),
        body: JSON.stringify({ password: passwordDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Không đổi được mật khẩu.');
      setNotice(`Đã đổi mật khẩu cho ${passwordEdit.username}.`);
      setPasswordDraft('');
      setPasswordEdit(null);
    } catch (err: any) {
      setError(err.message || 'Không đổi được mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (row: AccessUser) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/auth/users/${row.id}/status`, {
        method: 'PATCH',
        headers: makeAuthHeaders(),
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Không cập nhật được trạng thái.');
      setNotice(`${row.username} đã ${!row.is_active ? 'được mở khóa' : 'bị khóa'}.`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Không cập nhật được trạng thái.');
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/auth/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: makeAuthHeaders(false),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Không xóa được tài khoản.');
      setNotice(`Đã xóa tài khoản ${deleteTarget.username}.`);
      setDeleteTarget(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Không xóa được tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const actionButton = 'inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Quản lý người dùng</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cấp tài khoản, đổi quyền truy cập, khóa tài khoản và quản lý mật khẩu theo vai trò.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Đang đăng nhập: <span className="font-bold text-slate-900">{user?.username}</span>
        </div>
      </div>

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {error || notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 w-full items-start">
        <Card className="lg:col-span-1 rounded-xl border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-950">Cấp tài khoản mới</h3>
              <p className="text-xs text-slate-500">Mật khẩu tạm chỉ hiển thị một lần sau khi tạo.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Tên đăng nhập</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:bg-white transition" placeholder="operator_02" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Mật khẩu tạm</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:bg-white transition" placeholder="Bỏ trống để hệ thống tự sinh" />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Quyền truy cập</span>
              <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:bg-white transition">
                <option value="viewer">Người xem (Chỉ xem dữ liệu & báo cáo)</option>
                <option value="operator">Vận hành (Giám sát & duyệt biên bản)</option>
                <option value="admin">Quản trị (Toàn quyền hệ thống)</option>
              </select>
            </label>
            <button type="button" onClick={createAccount} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 shadow-sm">
              <Save className="h-4 w-4" /> Tạo tài khoản
            </button>
          </div>
        </Card>

        <Card className="lg:col-span-2 rounded-xl border-slate-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-slate-500" />
              <h3 className="font-semibold text-slate-950">Danh sách quyền truy cập</h3>
            </div>
            <span className="whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              {activeCount}/{users.length} hoạt động
            </span>
          </div>

          <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Tài khoản</th>
                  <th className="px-4 py-3">Quyền</th>
                  <th className="px-4 py-3">Phạm vi</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const isCurrentUser = row.username === user?.username;
                  return (
                    <tr key={row.id} className="border-t border-slate-200 align-middle">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.username}</td>
                      <td className="px-4 py-3 text-slate-600">{roleLabels[row.role] || row.role}</td>
                      <td className="px-4 py-3 text-slate-500">{roleScopes[row.role] || 'Theo cấu hình'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex min-w-[112px] items-center justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${row.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {row.is_active ? 'Đang hoạt động' : 'Tạm khóa'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <button onClick={() => { setPasswordEdit(row); setPasswordDraft(''); }} className={actionButton}>
                            <KeyRound className="h-3.5 w-3.5" /> Đổi mật khẩu
                          </button>
                          <button onClick={() => { setRoleEdit(row); setRoleDraft(row.role); }} className={actionButton}>
                            <ShieldCheck className="h-3.5 w-3.5" /> Sửa quyền
                          </button>
                          <button onClick={() => toggleStatus(row)} disabled={isCurrentUser} className={actionButton}>
                            {row.is_active ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            {row.is_active ? 'Khóa' : 'Mở'}
                          </button>
                          <button onClick={() => setDeleteTarget(row)} disabled={isCurrentUser} className={`${actionButton} border-rose-200 text-rose-600 hover:bg-rose-50`}>
                            <Trash2 className="h-3.5 w-3.5" /> Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {roleEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-950">Sửa quyền: {roleEdit.username}</h3>
            <select value={roleDraft} onChange={(event) => setRoleDraft(event.target.value as Role)} className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="viewer">Người xem</option>
              <option value="operator">Vận hành</option>
              <option value="admin">Quản trị</option>
            </select>
            <div className="mt-5 flex gap-2">
              <button onClick={saveRole} disabled={loading} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white">Lưu quyền</button>
              <button onClick={() => setRoleEdit(null)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {passwordEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-950">Đổi mật khẩu: {passwordEdit.username}</h3>
            <input value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} type="password" placeholder="Mật khẩu mới tối thiểu 8 ký tự" className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <div className="mt-5 flex gap-2">
              <button onClick={savePassword} disabled={loading} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white">Lưu mật khẩu</button>
              <button onClick={() => setPasswordEdit(null)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-950">Xóa tài khoản: {deleteTarget.username}</h3>
            <p className="mt-2 text-sm text-slate-500">
              Tài khoản bị xóa sẽ không thể đăng nhập lại. Hành động này dùng cho tài khoản thử nghiệm hoặc tài khoản không còn bàn giao vận hành.
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={deleteAccount} disabled={loading} className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700">Xóa tài khoản</button>
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700">Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
