import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrderDetail } from '@/lib/domain/admin-orders'
import { ORDER_STATUS_LABEL, ALLOWED_TRANSITIONS } from '@/lib/domain/state-machine'
import { PageTitle, Card } from '@/components/admin/shell'
import { ActionForm } from '@/components/admin/action-button'
import { formatSgd, cents } from '@/lib/money'
import {
  setOrderStatusAction,
  refundOrderAction,
  cancelOrderAction,
  advanceDeliveryAction,
} from '@/lib/admin/actions'
import { DELIVERY_STATUS_LABEL } from '@/lib/domain/fulfilment'
import { formatSlotWithDate } from '@/lib/domain/delivery-slots'
import { methodLabel } from '@/lib/notify/order-summary'

export const metadata: Metadata = { title: 'Order' }
export const dynamic = 'force-dynamic'

const sgt = (d: Date) =>
  d.toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' })

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await getOrderDetail(id)
  if (!order) notFound()

  const delivery = order.delivery
  const nextStatuses = ALLOWED_TRANSITIONS[order.orderStatus]

  return (
    <>
      <p className="mono mb-4 text-faint">
        <Link href="/admin/orders" className="hover:text-ink">
          Orders
        </Link>{' '}
        / {order.reference}
      </p>

      <PageTitle
        title={order.reference}
        subtitle={`Placed ${sgt(order.createdAt)}`}
        right={
          <div className="flex flex-wrap gap-2">
            <Pill label="Order" value={ORDER_STATUS_LABEL[order.orderStatus]} />
            <Pill label="Payment" value={order.payment?.paymentStatus ?? 'NONE'} />
            <Pill
              label="Delivery"
              value={
                delivery ? DELIVERY_STATUS_LABEL[delivery.deliveryStatus] : 'Not scheduled'
              }
            />
          </div>
        }
      />

      {order.orderStatus === 'REVIEW' ? (
        <div className="mb-6 border border-[#9c3b2b]/40 bg-[#9c3b2b]/5 px-5 py-4">
          <p className="mono text-[#9c3b2b]">Needs review</p>
          <p className="mt-2 text-[0.9375rem] text-body">{order.reviewReason}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mono border-b border-line px-5 py-3 text-faint">Items</h2>
            <table className="w-full">
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <p className="text-[0.9375rem] text-ink">{item.nameAtPurchase}</p>
                      <p className="mono-sm text-faint">{item.skuAtPurchase}</p>
                    </td>
                    <td className="figure px-5 py-3 text-right text-[0.875rem]">
                      {formatSgd(cents(item.unitPriceCents), { alwaysCents: true })} × {item.quantity}
                    </td>
                    <td className="figure px-5 py-3 text-right text-[0.9375rem] text-ink">
                      {formatSgd(cents(item.lineTotalCents), { alwaysCents: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="border-t border-line px-5 py-4 text-[0.875rem]">
              <Row label="Subtotal" value={formatSgd(cents(order.subtotalCents), { alwaysCents: true })} />
              {order.discountCents > 0 ? (
                <Row
                  label={`Discount${order.discountCode ? ` (${order.discountCode.code})` : ''}`}
                  value={`−${formatSgd(cents(order.discountCents), { alwaysCents: true })}`}
                />
              ) : null}
              <Row
                label="Delivery charged"
                value={formatSgd(cents(order.deliveryFeeCents), { alwaysCents: true })}
              />
              <div className="mt-2 flex justify-between border-t border-line pt-3">
                <dt className="font-medium text-ink">Total paid</dt>
                <dd className="figure text-[1.125rem] font-semibold text-ink">
                  {formatSgd(cents(order.totalCents), { alwaysCents: true })}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mono border-b border-line px-5 py-3 text-faint">Timeline</h2>
            <ol className="divide-y divide-line">
              {order.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-x-4 px-5 py-2.5">
                  <span className="mono-sm w-40 shrink-0 text-faint">{sgt(event.createdAt)}</span>
                  <span className="mono-sm text-ink">{event.type}</span>
                  <span className="mono-sm text-faint">{event.actor}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="px-5 py-4">
            <h2 className="mono mb-3 text-faint">Customer</h2>
            <p className="text-[0.9375rem] text-ink">{order.contactName}</p>
            <p className="mt-1 text-[0.875rem]">
              <a href={`tel:${order.contactPhone}`} className="figure text-body underline underline-offset-4">
                {order.contactPhone}
              </a>
            </p>
            <p className="text-[0.875rem]">
              <a href={`mailto:${order.contactEmail}`} className="text-body underline underline-offset-4">
                {order.contactEmail}
              </a>
            </p>
            <div className="mt-4 border-t border-line pt-3 text-[0.875rem] leading-relaxed text-body">
              <p>{order.addressLine1}</p>
              {order.addressLine2 ? <p>{order.addressLine2}</p> : null}
              <p className="figure">Singapore {order.postalCode}</p>
            </div>
            {order.instructions ? (
              <p className="mt-3 border-t border-line pt-3 text-[0.875rem] text-muted">
                “{order.instructions}”
              </p>
            ) : null}
          </Card>

          <Card className="px-5 py-4">
            <h2 className="mono mb-3 text-faint">Payment</h2>
            {order.payment ? (
              <dl className="space-y-1.5 text-[0.875rem]">
                <Row label="Status" value={order.payment.paymentStatus} />
                <Row label="Method" value={order.payment.method ?? '—'} />
                <Row label="Provider" value={order.payment.provider} />
                <Row label="PaymentIntent" value={order.payment.requestId} mono />
                <Row label="Charge" value={order.payment.paymentId ?? '—'} mono />
                {order.payment.paidAt ? <Row label="Paid" value={sgt(order.payment.paidAt)} /> : null}
                <Row
                  label="Receipt emailed"
                  value={order.payment.receiptSentAt ? sgt(order.payment.receiptSentAt) : 'Not yet'}
                />
                <Row
                  label="WhatsApp alert"
                  value={order.payment.notifiedAt ? sgt(order.payment.notifiedAt) : 'Not yet'}
                />
              </dl>
            ) : (
              <p className="text-[0.875rem] text-muted">No payment record.</p>
            )}
          </Card>

          <Card className="px-5 py-4">
            <h2 className="mono mb-3 text-faint">Delivery</h2>
            <dl className="space-y-1.5 text-[0.875rem]">
              <Row label="Speed" value={methodLabel(order.deliveryMethod)} />
              <Row
                label="Slot"
                value={
                  order.deliverySlotStart && order.deliverySlotEnd
                    ? formatSlotWithDate({
                        start: order.deliverySlotStart,
                        end: order.deliverySlotEnd,
                      })
                    : 'Not booked'
                }
              />
              <Row label="Fee charged" value={formatSgd(cents(order.deliveryFeeCents), { alwaysCents: true })} />
            </dl>
            {delivery ? (
              <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[0.875rem]">
                <Row label="Status" value={DELIVERY_STATUS_LABEL[delivery.deliveryStatus]} />
                <Row label="Carried by" value={delivery.courierRef ?? '—'} mono />
                <Row
                  label="Cost to us"
                  value={
                    delivery.actualCostCents === null
                      ? '—'
                      : formatSgd(cents(delivery.actualCostCents), { alwaysCents: true })
                  }
                />
                {delivery.actualCostCents !== null ? (
                  <Row
                    label="Margin"
                    value={formatSgd(cents(order.deliveryFeeCents - delivery.actualCostCents), {
                      alwaysCents: true,
                    })}
                  />
                ) : null}
                {delivery.dispatchedAt ? <Row label="Dispatched" value={sgt(delivery.dispatchedAt)} /> : null}
                {delivery.deliveredAt ? <Row label="Delivered" value={sgt(delivery.deliveredAt)} /> : null}
                {delivery.notes ? (
                  <p className="mt-2 text-[0.8125rem] text-muted">{delivery.notes}</p>
                ) : null}
                {delivery.failureReason ? (
                  <p className="mono-sm mt-2 text-[#9c3b2b]">{delivery.failureReason}</p>
                ) : null}
              </dl>
            ) : (
              <p className="mt-3 border-t border-line pt-3 text-[0.875rem] text-muted">
                No fulfilment record yet — one opens when payment clears.
              </p>
            )}
          </Card>

          <Card className="space-y-4 px-5 py-4">
            <h2 className="mono text-faint">Actions</h2>

            {delivery ? (
              <div className="space-y-3">
                <p className="mono-sm text-faint">Advance the run</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const).map((status) => (
                    <ActionForm
                      key={status}
                      action={advanceDeliveryAction}
                      label={DELIVERY_STATUS_LABEL[status]}
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="status" value={status} />
                    </ActionForm>
                  ))}
                </div>

                <details className="border-t border-line pt-3">
                  <summary className="mono-sm cursor-pointer text-muted">
                    Dispatch with details
                  </summary>
                  <ActionForm
                    action={advanceDeliveryAction}
                    label="Mark out for delivery"
                    className="mt-3 space-y-2"
                  >
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value="OUT_FOR_DELIVERY" />
                    <input
                      name="courierRef"
                      placeholder="Carried by (e.g. own van — Ravi)"
                      className="h-10 w-full border border-line-strong px-3 text-[0.8125rem]"
                    />
                    <input
                      name="costSgd"
                      inputMode="decimal"
                      placeholder="Cost to us, SGD (optional)"
                      className="h-10 w-full border border-line-strong px-3 text-[0.8125rem]"
                    />
                    <input
                      name="notes"
                      placeholder="Notes (optional)"
                      className="h-10 w-full border border-line-strong px-3 text-[0.8125rem]"
                    />
                  </ActionForm>
                </details>

                <ActionForm
                  action={advanceDeliveryAction}
                  label="Mark failed"
                  variant="danger"
                  confirm="Record this delivery as failed? The order returns to Ready for delivery."
                  className="border-t border-line pt-3"
                >
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="status" value="FAILED" />
                  <input
                    name="failureReason"
                    placeholder="What went wrong"
                    className="mb-2 h-10 w-full border border-line-strong px-3 text-[0.8125rem]"
                  />
                </ActionForm>
              </div>
            ) : null}

            {nextStatuses.length > 0 ? (
              <div className="border-t border-line pt-3">
                <p className="mono-sm mb-2 text-faint">Move to</p>
                <div className="grid grid-cols-2 gap-2">
                  {nextStatuses
                    .filter((s) => !['REFUNDED', 'CANCELLED'].includes(s))
                    .map((status) => (
                      <ActionForm
                        key={status}
                        action={setOrderStatusAction}
                        label={ORDER_STATUS_LABEL[status]}
                      >
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="to" value={status} />
                      </ActionForm>
                    ))}
                </div>
              </div>
            ) : null}

            {order.payment?.paymentStatus === 'PAID' ? (
              <ActionForm
                action={refundOrderAction}
                label="Refund in full"
                variant="danger"
                confirm="Refund this order through Stripe? PayNow refunds go back to the payer's bank and cannot be undone."
                className="border-t border-line pt-3"
              >
                <input type="hidden" name="orderId" value={order.id} />
                <input
                  name="reason"
                  placeholder="Reason for the refund"
                  className="mb-2 h-10 w-full border border-line-strong px-3 text-[0.8125rem]"
                />
                <label className="mb-2 flex items-center gap-2 text-[0.8125rem] text-body">
                  <input type="checkbox" name="restoreStock" defaultChecked />
                  Restore stock (only if the goods were not delivered)
                </label>
              </ActionForm>
            ) : null}

            {!['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.orderStatus) ? (
              <ActionForm
                action={cancelOrderAction}
                label="Cancel order"
                variant="danger"
                confirm="Cancel this order? Stock will be restored if it was paid."
                className="border-t border-line pt-3"
              >
                <input type="hidden" name="orderId" value={order.id} />
                <input
                  name="reason"
                  placeholder="Reason"
                  className="mb-2 h-10 w-full border border-line-strong px-3 text-[0.8125rem]"
                />
              </ActionForm>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="mono-sm border border-line-strong px-2.5 py-1.5">
      <span className="text-faint">{label}</span> <span className="text-ink">{value}</span>
    </span>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right text-ink ${mono ? 'figure text-[0.8125rem]' : ''}`}>{value}</dd>
    </div>
  )
}
