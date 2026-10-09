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
    <nav aria-label="商品分類" className="pos-category-nav">
      {all.map((category) => (
        <button
          type="button"
          aria-pressed={selectedId === category.id}
          key={category.id ?? 'all'}
          onClick={() => onSelect(category.id)}
          className={`pos-category-btn${selectedId === category.id ? ' pos-category-btn--active' : ''}`}
        >
          {selectedId === category.id && <span aria-hidden="true">✓ </span>}
          {category.name}
        </button>
      ))}
    </nav>
  );
}
