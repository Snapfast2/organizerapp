import { NextResponse } from 'next/server';
import { emptyTrash } from '@/lib/trash';

export async function POST() {
  try {
    emptyTrash();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
