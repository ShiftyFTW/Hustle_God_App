import { NextRequest, NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = createUserClient(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('sneaker_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('items list failed:', error);
    return NextResponse.json({ error: 'Could not load items. Please try again.' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = createUserClient(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid item payload is required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('sneaker_items')
    .insert(body)
    .select()
    .single();

  if (error) {
    console.error('item create failed:', error);
    return NextResponse.json({ error: 'Could not create the item. Please try again.' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
