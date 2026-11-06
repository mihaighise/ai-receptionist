import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// A checkbox list over an array field: ticking adds the value, unticking removes it.
export function CheckboxGroup({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
      {items.map((item) => (
        <Label key={item.value} className="cursor-pointer font-normal">
          <Checkbox
            checked={value.includes(item.value)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, item.value] : value.filter((v) => v !== item.value))
            }
          />
          {item.label}
        </Label>
      ))}
    </div>
  );
}
