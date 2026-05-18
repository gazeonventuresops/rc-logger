import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ message: 'Username and password required.' }, { status: 400 });
    }

    // First-run database initialization auto-seeder
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      // 1. Create a default store
      let store = await prisma.store.findUnique({ where: { name: 'East Warehouse' } });
      if (!store) {
        store = await prisma.store.create({
          data: {
            name: 'East Warehouse',
            location: 'Building A, Grid-C',
          },
        });
      }

      // 2. Hash default operator password
      const operatorHash = await bcrypt.hash('operator123', 10);
      await prisma.user.create({
        data: {
          username: 'operator',
          passwordHash: operatorHash,
          role: 'USER',
          storeId: store.id,
        },
      });

      // 3. Hash default admin password
      const adminHash = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: {
          username: 'admin',
          passwordHash: adminHash,
          role: 'ADMIN',
        },
      });

      console.log('Seeded default user accounts: (operator/operator123), (admin/admin123)');
    }

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { username },
      include: { store: true },
    });

    if (!user) {
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    // Verify Password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        store: user.store ? { id: user.store.id, name: user.store.name } : null,
      },
    });
  } catch (error: any) {
    console.error('Login error: ', error);
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}
