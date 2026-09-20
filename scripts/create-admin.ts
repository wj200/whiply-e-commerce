/**
 * Blueprint §16.13 — create the owner admin account and enrol TOTP.
 *
 *   npx tsx scripts/create-admin.ts owner@whiply.sg
 *
 * Prints the otpauth:// URI to scan and the recovery guidance. The password
 * is read from stdin so it never lands in shell history.
 */
import { createInterface } from 'node:readline/promises'
import { PrismaClient } from '../lib/generated/prisma'
import { hashPassword } from '../lib/auth/password'
import { generateTotpSecret, totpUri, verifyTotp } from '../lib/auth/totp'

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email>')
    process.exit(1)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const password = await rl.question('Password (min 12 characters): ')
  if (password.length < 12) {
    console.error('\nPassword must be at least 12 characters.')
    process.exit(1)
  }
  const confirm = await rl.question('Confirm password: ')
  if (password !== confirm) {
    console.error('\nPasswords do not match.')
    process.exit(1)
  }

  const secret = generateTotpSecret()
  const uri = totpUri(secret, email)

  console.log('\n─────────────────────────────────────────────────────')
  console.log('Add this to your authenticator app:\n')
  console.log(`  Secret : ${secret}`)
  console.log(`  URI    : ${uri}`)
  console.log('\n─────────────────────────────────────────────────────\n')

  const code = await rl.question('Enter the 6-digit code from your app to confirm: ')
  if (!verifyTotp(secret, code)) {
    console.error('\nThat code did not verify. Nothing was created — run the script again.')
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      totpSecret: secret,
      totpEnrolled: true,
      role: 'OWNER',
      isActive: true,
    },
    update: { passwordHash, totpSecret: secret, totpEnrolled: true, isActive: true },
  })

  console.log(`\n✓ Admin account ready: ${user.email} (${user.role})`)
  console.log('\nStore the secret above somewhere that is NOT the same phone as the')
  console.log('authenticator app. Without it, and without this password, you cannot')
  console.log('get back into the admin panel.\n')

  await rl.close()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
