import { NextRequest, NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'A valid item reference is required.' }, { status: 400 });
  }

  const supabase = createUserClient(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('sneaker_items')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    console.error('item fetch failed:', error);
    return NextResponse.json({ error: 'Could not load the item. Please try again.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'A valid item reference is required.' }, { status: 400 });
  }

  const supabase = createUserClient(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  // Verify ownership before deleting
  const { data: item } = await supabase
    .from('sneaker_items')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  }

  // Delete related data first, then the item
  const { error } = await supabase
    .from('sneaker_items')
    .delete()
    .eq('id', params.id);

  if (error) {
    console.error('item delete failed:', error);
    return NextResponse.json({ error: 'Could not delete the item. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'A valid item reference is required.' }, { status: 400 });
  }

  const supabase = createUserClient(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid update payload is required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('sneaker_items')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    console.error('item update failed:', error);
    return NextResponse.json({ error: 'Could not save the item. Please try again.' }, { status: 500 });
  }
  return NextResponse.json(data);
}
