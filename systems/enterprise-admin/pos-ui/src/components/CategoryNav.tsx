interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategoryNav({ categories, selectedId, onSelect }: Props) {
  const all = [{ id: null as string | null, name: '全部' }, ...categories];

  return (
    <nav
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 8,
        overflowY: 'auto',
        borderRight: '1px solid var(--border)',
        minWidth: 100,
      }}
    >
      {all.map((category) => (
        <button
          type="button"
          key={category.id ?? 'all'}
          onClick={() => onSelect(category.id)}
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--radius-xs)',
            border: 'none',
            background: selectedId === category.id ? 'var(--accent-subtle)' : 'transparent',
            color: selectedId === category.id ? 'var(--accent-text)' : 'var(--text-secondary)',
            fontWeight: selectedId === category.id ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 13,
          }}
        >
          {category.name}
        </button>
      ))}
    </nav>
  );
}
