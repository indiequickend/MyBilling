export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-slate-50">
      <tr className="border-b border-slate-200 text-left text-slate-500">{children}</tr>
    </thead>
  );
}

export function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2 font-medium">{children}</th>;
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">{children}</tr>;
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2 ${className ?? ""}`}>{children}</td>;
}

export function TableEmptyState({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-slate-500">
        {message}
      </td>
    </tr>
  );
}
