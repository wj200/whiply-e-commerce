import { Chip } from '@/components/ui/chip'

export function CategoryChips({
  active,
}: {
  active: 'all' | 'equipment' | 'chargers' | 'cream'
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <Chip href="/shop" active={active === 'all'}>
        All products
      </Chip>
      <Chip href="/baking-equipment" active={active === 'equipment'}>
        Equipment
      </Chip>
      <Chip href="/cream-chargers" active={active === 'chargers'}>
        Cream chargers
      </Chip>
      <Chip href="/cream-products" active={active === 'cream'}>
        Cream
      </Chip>
    </div>
  )
}
