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
    <nav className="pos-category-nav">
      {all.map((category) => (
        <button
          type="button"
          key={category.id ?? 'all'}
          onClick={() => onSelect(category.id)}
          className={`pos-category-btn${selectedId === category.id ? ' pos-category-btn--active' : ''}`}
        >
          {category.name}
        </button>
      ))}
    </nav>
  );
}
