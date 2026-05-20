import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  uploadUrl: string;
  queryKey: string[];
  label: string;
}

export function CsvImportModal({ isOpen, onClose, uploadUrl, queryKey, label }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(uploadUrl, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      onClose();
      alert(`匯入完成：新增 ${data.data.created} 筆，略過重複 ${data.data.skipped} 筆`);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message ?? '匯入失敗，請確認 CSV 格式');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">批次匯入 {label}</h2>
        <p className="mb-3 text-sm text-gray-500">
          請上傳 CSV 檔案。欄位：商品名稱、SKU、售價、成本、庫存、安全庫存天數
        </p>
        {error && (
          <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-sm"
          onChange={() => setError(null)}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={() => {
              const file = fileRef.current?.files?.[0];
              if (!file) return setError('請選擇 CSV 檔案');
              setError(null);
              mutation.mutate(file);
            }}
            disabled={mutation.isPending}
            className="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? '上傳中...' : '確認匯入'}
          </button>
        </div>
      </div>
    </div>
  );
}
