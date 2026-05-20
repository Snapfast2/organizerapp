import { NextResponse } from 'next/server';
import { getTrashItems } from '@/lib/trash';

export async function GET() {
  try {
    const items = getTrashItems();
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
