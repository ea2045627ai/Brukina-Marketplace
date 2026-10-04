import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

const sb = createClient('https://ttwezetyljptvtdlvgyxr.supabase.co', 'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92');
const items = [
  {Id: 101, name: 'Anti-Shock Phone Case Combo', vendor: 'Aflao Wholesale', price: 45},
  {Id: 102, name: 'Premium Screen Protectors Box', vendor: 'Circle Electronics', price: 120},
  {Id: 103, name: 'USB-C Fast Chargers 20W', vendorZ 'Accra Digital Supply', price: 35}
];

function App() {
  const [tab, setTab] = useState('feed');
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    sb.from('momo_deposits').select('*').order('created_at', { ascending: false }).then(({ data }) => data && setOrders(data));
  }, [tab, cart ]);

  const pay = async () => {
    setLoading(true);
    const amt = cart.reduce((s, i) => s + i.price, 0);
    try {
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, email: 'test@brukina.com', userId: 'dev_user_01' })
      });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
    } catch (e) { console.log('Error'); }
    setLoading(false);
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', background: '#FDFBF7', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 10 }}>
        <h2<�	IU-%9�5I-QA1���(�����������(�������������ѽ���������젤����͕�Q������������������ѽ��(�������������ѽ���������젤����͕�Q�������М�����Ѐ�쁍��й����Ѡ������ѽ��(�������������ѽ���������젤����͕�Q�����ɑ��̜���1����Ȁ�쁽ɑ��̹����Ѡ������ѽ��(��������𽑥��(������𽑥��(�������х����􀝙���������(���������؁��屔��쁑������耝�ɥ�����ɥ�Q�����ѕ��յ��耝ɕ���С��Ѽ���а�����������ఀřȤ���������԰���ɝ��Q���������(����������쁥ѕ�̹������������(�������������؁�������%�����屔��쀉��ɑ�Ȉ耈����ͽ����������������������԰�������ɽչ��耈���������(�������������������������������(�����������������!L������ɥ��������(�����������������ѽ���������젤����͕���Сl������а��t������Ѽ�������ѽ��(������������𽑥��(�������������(��������𽑥��(��������(�������х����􀝍��М�����(���������؁��屔��쁵�ɝ��Q������������ɽչ�耜���������������������ɑ��耜����ͽ�������������(��������������X�]�Hܙ\��]�\��ς���\��X\

�JHO�
��^O^�HHO���˛�[YH_HH����˜�X�H_O���
J_B���[������\���YX�J
�JHO��
�K��X�K
H_O���'WGF����6Ɩ6�ײ��F�6&�VCײ��F��r�緲��F��r�t6���V7F��r���r�u�6R�&FW"r����'WGF�����F�c��Т�F"���v�&FW'2rbb���F�b7G��S׷��&v��F��#�&6�w&�V43�r6ffbr�FF��s�#�&�&FW#�s'�6�ƖB3r���ƃ3