import { displayPlaceText } from '../display-text';

describe('displayPlaceText', () => {
  it('title-cases all-caps names and addresses', () => {
    expect(displayPlaceText('AL-MASJIDUL FALAH')).toBe('Al-Masjidul Falah');
    expect(displayPlaceText('23, FORBES LANE, MARADANA')).toBe('23, Forbes Lane, Maradana');
    expect(displayPlaceText('MASJID (JUMMA) MOSQUE')).toBe('Masjid (Jumma) Mosque');
  });

  it('leaves mixed-case text exactly as written', () => {
    expect(displayPlaceText('Jami Ul-Alfar Mosque')).toBe('Jami Ul-Alfar Mosque');
    expect(displayPlaceText('WVG6+RFQ, Colombo')).toBe('WVG6+RFQ, Colombo');
  });

  it('drops a stray trailing comma or dash', () => {
    expect(displayPlaceText('55, Lake Road,')).toBe('55, Lake Road');
    expect(displayPlaceText('251, MOHIDEEN MASJID ROAD, ')).toBe('251, Mohideen Masjid Road');
    expect(displayPlaceText('Maradana -')).toBe('Maradana');
  });

  it('leaves text with no letters alone', () => {
    expect(displayPlaceText('133 & 133/1')).toBe('133 & 133/1');
  });
});
