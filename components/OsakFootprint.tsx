import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

// ===== Demo constants (간이 추정치 / 공식보고용 아님) =====
const BASE = {
  homePerPerson: 1.4, // 주거/에너지 (tCO2e/인·년)
  transportPerPerson: 2.1, // 교통
  foodPerPerson: 1.7, // 식품
  otherPerPerson: 0.9, // 기타소비
};

const FACTORS = {
  transport: { car: 1.4, mixed: 1.0, transit: 0.75, active: 0.4 },
  diet: { meat: 1.3, mixed: 1.0, veg: 0.7 },
  energy: { high: 0.8, mid: 1.0, low: 1.2 },
  lifestyle: { frugal: 0.9, mid: 1.0, spend: 1.1 },
  flights: { none: 0.0, few: 0.3, some: 0.9, many: 2.0 },
  // 생활 실천 (복수선택) — 곱연산, 하한 0.6
  practice: {
    ecoBag: 0.95,
    tumbler: 0.95,
    reduceDisposable: 0.9,
    recycle: 0.9,
    unplug: 0.9,
    tempControl: 0.92, // 냉난방 적정 온도
  },
} as const;

type PracticeKey = keyof typeof FACTORS.practice;

const COLORS = ["#2E7D5B", "#6BBE77", "#F2B705", "#2BA7B1", "#E85D4A"];
const CATEGORY_COLORS: Record<string, string> = {
  "주거/에너지": COLORS[0],
  "교통": COLORS[1],
  "식품": COLORS[2],
  "기타소비": COLORS[3],
  "항공": COLORS[4],
};
const AVOIDED_PER_KM_CAR_KG = 0.19; // 차량 평균 0.19 kgCO2/km 가정

function format(num: number) {
  return Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function calcSubtotal(
  people: number,
  transport: keyof typeof FACTORS.transport,
  diet: keyof typeof FACTORS.diet,
  energy: keyof typeof FACTORS.energy,
  lifestyle: keyof typeof FACTORS.lifestyle,
  flights: keyof typeof FACTORS.flights,
  householdScale: number,
) {
  const home = BASE.homePerPerson * people * householdScale * FACTORS.energy[energy];
  const transportVal = BASE.transportPerPerson * people * FACTORS.transport[transport];
  const food = BASE.foodPerPerson * people * FACTORS.diet[diet];
  const other = BASE.otherPerPerson * people * FACTORS.lifestyle[lifestyle];
  const flightAdd = FACTORS.flights[flights];
  return { home, transportVal, food, other, flightAdd, subtotal: home + transportVal + food + other + flightAdd };
}

function calcPracticeMultiplier(practice: PracticeKey[]) {
  const mul = practice.reduce((acc, k) => acc * FACTORS.practice[k], 1);
  return Math.max(0.6, mul);
}

export default function OsakDulegilSurveyAndFootprint() {
  // ===== 설문 =====
  const [step, setStep] = useState(1);
  const [survey, setSurvey] = useState({ know: "없다", walked: "없다", reasons: [] as string[], satisfaction: [] as string[] });
  const [bonus, setBonus] = useState(0); // 설문 가산점: 1번 +1, 2번 +3 → 총 4, 1점당 2% 감산

  useEffect(() => {
    let b = 0;
    if (survey.know === "있다") b += 1;
    if (survey.walked === "있다") b += 3;
    setBonus(b);
  }, [survey]);

  // ===== 계산기 상태 =====
  const [people, setPeople] = useState(2);
  const [transport, setTransport] = useState<keyof typeof FACTORS.transport>("mixed");
  const [diet, setDiet] = useState<keyof typeof FACTORS.diet>("mixed");
  const [energy, setEnergy] = useState<keyof typeof FACTORS.energy>("mid");
  const [lifestyle, setLifestyle] = useState<keyof typeof FACTORS.lifestyle>("mid");
  const [flights, setFlights] = useState<keyof typeof FACTORS.flights>("none");
  const [practice, setPractice] = useState<PracticeKey[]>([]);
  const [walkKmToday, setWalkKmToday] = useState(3);
  const [calculated, setCalculated] = useState(false);

  const householdScale = useMemo(() => Math.max(0.6, 1 - 0.1 * (people - 1)), [people]);
  const practiceMultiplier = useMemo(() => calcPracticeMultiplier(practice), [practice]);

  const result = useMemo(() => {
    const { home, transportVal, food, other, flightAdd, subtotal } = calcSubtotal(
      people,
      transport,
      diet,
      energy,
      lifestyle,
      flights,
      householdScale,
    );
    // 설문 가산점: 1점당 2% 감산
    const bonusMultiplier = 1 - bonus * 0.02;
    const total = subtotal * practiceMultiplier * bonusMultiplier;

    const breakdown = [
      { name: "주거/에너지", value: home },
      { name: "교통", value: transportVal },
      { name: "식품", value: food },
      { name: "기타소비", value: other },
      { name: "항공", value: flightAdd },
    ];

    const perPerson = people > 0 ? total / people : total;
    const bands = [
      { max: 3, tier: "S", label: "아주 우수" },
      { max: 5, tier: "A", label: "우수" },
      { max: 7, tier: "B", label: "보통" },
      { max: 9, tier: "C", label: "개선 필요" },
      { max: Infinity, tier: "D", label: "많이 개선 필요" },
    ];
    const rank = bands.find((b) => perPerson <= b.max)!;

    return { total, breakdown, perPerson, rank };
  }, [people, transport, diet, energy, lifestyle, flights, householdScale, practiceMultiplier, bonus]);

  const avoidedKg = useMemo(() => Math.max(0, walkKmToday) * AVOIDED_PER_KM_CAR_KG, [walkKmToday]);

  const togglePractice = (key: PracticeKey, checked: boolean | string) => {
    const isOn = checked === true;
    setPractice((prev) => {
      const set = new Set(prev);
      if (isOn) set.add(key); else set.delete(key);
      return Array.from(set);
    });
  };

  // ===== UI =====
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white p-6 md:p-10">
      {step === 1 && (
        <Card className="max-w-3xl mx-auto border-emerald-100 rounded-2xl">
          <CardContent className="p-6 space-y-6">
            <h1 className="text-2xl font-extrabold text-emerald-900">오색둘레길 홍보 설문</h1>
            <div>
              <Label className="font-bold text-lg text-emerald-800">1. 오색둘레길을 알고 있다</Label>
              <RadioGroup value={survey.know} onValueChange={(v) => setSurvey({ ...survey, know: v })} className="mt-2 flex gap-6">
                <Label htmlFor="knowYes" className="flex items-center gap-2"><RadioGroupItem id="knowYes" value="있다" />있다</Label>
                <Label htmlFor="knowNo" className="flex items-center gap-2"><RadioGroupItem id="knowNo" value="없다" />없다</Label>
              </RadioGroup>
            </div>
            <div>
              <Label className="font-bold text-lg text-emerald-800">2. 오색둘레길을 직접 걸어본 적이 있다</Label>
              <RadioGroup value={survey.walked} onValueChange={(v) => setSurvey({ ...survey, walked: v })} className="mt-2 flex gap-6">
                <Label htmlFor="walkedYes" className="flex items-center gap-2"><RadioGroupItem id="walkedYes" value="있다" />있다</Label>
                <Label htmlFor="walkedNo" className="flex items-center gap-2"><RadioGroupItem id="walkedNo" value="없다" />없다</Label>
              </RadioGroup>
            </div>
            <div>
              <Label className="font-bold text-lg text-emerald-800">3. 오색둘레길을 걸은 이유는 무엇인가요? (복수 선택 가능)</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {["건강/운동", "자연감상", "가족·친구와 여가", "행사참여", "기타"].map((r) => (
                  <label key={r} className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer">
                    <Checkbox id={r} checked={survey.reasons.includes(r)} onCheckedChange={(c) => {
                      const isOn = c === true;
                      setSurvey((prev) => {
                        const set = new Set(prev.reasons);
                        if (isOn) set.add(r); else set.delete(r);
                        return { ...prev, reasons: Array.from(set) };
                      });
                    }} />{r}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="font-bold text-lg text-emerald-800">4. 오색둘레길을 걸으며 가장 만족스러웠던 점은 무엇인가요?</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {["자연환경", "코스의 편안함", "안내표지", "접근성", "기타"].map((v) => (
                  <label key={v} className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer">
                    <Checkbox id={v} checked={survey.satisfaction.includes(v)} onCheckedChange={(c) => {
                      const isOn = c === true;
                      setSurvey((prev) => {
                        const set = new Set(prev.satisfaction);
                        if (isOn) set.add(v); else set.delete(v);
                        return { ...prev, satisfaction: Array.from(set) };
                      });
                    }} />{v}
                  </label>
                ))}
              </div>
            </div>
            <div className="pt-4 flex justify-between items-center">
              <div className="text-emerald-800 font-semibold">현재 가산점: +{bonus}점 (최대 4점)</div>
              <Button onClick={() => setStep(2)} className="bg-emerald-600 hover:bg-emerald-700 text-white">다음 (탄소발자국 계산하기)</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="mx-auto max-w-6xl space-y-6">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-600/90 flex items-center justify-center text-white font-bold shadow-sm">O5</div>
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-emerald-900">오색둘레길 탄소발자국 계산기 <span className="text-slate-400 text-lg">(부스 데모)</span></h2>
              <p className="text-slate-600 text-sm md:text-base">설문이 완료되었습니다. 아래에서 생활 배출량을 추정해보세요.</p>
            </div>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* ===== Left: Inputs ===== */}
            <Card className="rounded-2xl border-emerald-100">
              <CardContent className="p-6 space-y-6">
                <div>
                  <Label className="text-base font-bold" style={{ color: CATEGORY_COLORS["주거/에너지"] }}>○ 가구 인원</Label>
                  <div className="flex items-center gap-4 mt-3">
                    <Slider value={[people]} onValueChange={(v) => { setPeople(v[0]); setCalculated(false); }} min={1} max={8} step={1} className="w-full" />
                    <div className="w-16 text-center font-semibold">{people}명</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-bold" style={{ color: CATEGORY_COLORS["교통"] }}>○ 이동방식</Label>
                  <RadioGroup value={transport} onValueChange={(v)=>{ setTransport(v); setCalculated(false); }} className="grid grid-cols-2 gap-2">
                    <Label htmlFor="car" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="car" value="car" />자가용</Label>
                    <Label htmlFor="mixed" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="mixed" value="mixed" />혼합</Label>
                    <Label htmlFor="transit" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="transit" value="transit" />대중교통</Label>
                    <Label htmlFor="active" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="active" value="active" />도보·자전거</Label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-bold" style={{ color: CATEGORY_COLORS["식품"] }}>○ 식습관</Label>
                  <RadioGroup value={diet} onValueChange={(v)=>{ setDiet(v); setCalculated(false); }} className="grid grid-cols-3 gap-2">
                    <Label htmlFor="meat" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="meat" value="meat" />육류</Label>
                    <Label htmlFor="mix" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="mix" value="mixed" />혼합</Label>
                    <Label htmlFor="veg" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="veg" value="veg" />채식</Label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-bold" style={{ color: CATEGORY_COLORS["주거/에너지"] }}>○ 에너지 절약 수준</Label>
                  <RadioGroup value={energy} onValueChange={(v)=>{ setEnergy(v); setCalculated(false); }} className="grid grid-cols-3 gap-2">
                    <Label htmlFor="high" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="high" value="high" />많이</Label>
                    <Label htmlFor="mid" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="mid" value="mid" />보통</Label>
                    <Label htmlFor="low" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="low" value="low" />거의 안 함</Label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-bold" style={{ color: CATEGORY_COLORS["기타소비"] }}>○ 생활 소비 성향</Label>
                  <RadioGroup value={lifestyle} onValueChange={(v)=>{ setLifestyle(v); setCalculated(false); }} className="grid grid-cols-3 gap-2">
                    <Label htmlFor="frugal" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="frugal" value="frugal" />절약형</Label>
                    <Label htmlFor="midLifestyle" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="midLifestyle" value="mid" />보통</Label>
                    <Label htmlFor="spend" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="spend" value="spend" />소비형</Label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-bold" style={{ color: CATEGORY_COLORS["항공"] }}>○ 연간 항공 여행</Label>
                  <RadioGroup value={flights} onValueChange={(v)=>{ setFlights(v); setCalculated(false); }} className="grid grid-cols-4 gap-2">
                    <Label htmlFor="none" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="none" value="none" />0회</Label>
                    <Label htmlFor="few" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="few" value="few" />1회</Label>
                    <Label htmlFor="some" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="some" value="some" />2~4회</Label>
                    <Label htmlFor="many" className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer"><RadioGroupItem id="many" value="many" />5회+</Label>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-bold text-emerald-900">○ 오늘 내가 걸은 길 (km)</Label>
                  <div className="flex items-center gap-4">
                    <Slider value={[walkKmToday]} onValueChange={(v) => { setWalkKmToday(v[0]); setCalculated(false); }} min={0} max={20} step={0.5} className="w-full" />
                    <div className="w-20 text-center font-semibold">{walkKmToday} km</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-bold text-emerald-900">○ 생활 실천 (복수 선택)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer">
                      <Checkbox id="ecoBag" checked={practice.includes("ecoBag")} onCheckedChange={(c) => { togglePractice("ecoBag", c); setCalculated(false); }} />에코백 사용
                    </label>
                    <label className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer">
                      <Checkbox id="tumbler" checked={practice.includes("tumbler")} onCheckedChange={(c) => { togglePractice("tumbler", c); setCalculated(false); }} />텀블러 사용
                    </label>
                    <label className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer">
                      <Checkbox id="reduceDisposable" checked={practice.includes("reduceDisposable")} onCheckedChange={(c) => { togglePractice("reduceDisposable", c); setCalculated(false); }} />일회용품 줄이기
                    </label>
                    <label className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer">
                      <Checkbox id="recycle" checked={practice.includes("recycle")} onCheckedChange={(c) => { togglePractice("recycle", c); setCalculated(false); }} />분리수거하기
                    </label>
                    <label className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer">
                      <Checkbox id="unplug" checked={practice.includes("unplug")} onCheckedChange={(c) => { togglePractice("unplug", c); setCalculated(false); }} />전기 콘센트 뽑기
                    </label>
                    <label className="flex items-center gap-2 border p-3 rounded-xl cursor-pointer">
                      <Checkbox id="tempControl" checked={practice.includes("tempControl")} onCheckedChange={(c) => { togglePractice("tempControl", c); setCalculated(false); }} />냉난방 적정 온도
                    </label>
                  </div>
                  <div className="pt-1 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setPractice([])}>생활 실천 선택 해제</Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCalculated(true)}>결과 보기</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ===== Right: Results ===== */}
            {!calculated ? (
              <Card className="rounded-2xl border-emerald-100">
                <CardContent className="p-6 h-full flex items-center justify-center">
                  <div className="text-center text-slate-600">
                    <div className="text-lg font-semibold mb-1">입력을 마친 뒤 ‘결과 보기’를 눌러주세요</div>
                    <div className="text-sm">모든 항목을 선택/조정하면 버튼이 활성화됩니다.</div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-2xl border-emerald-100">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-sm text-emerald-700">예상 연간 총배출(가구)</div>
                      <div className="text-4xl md:text-5xl font-extrabold mt-1 text-emerald-900">
                        {format(result.total)} <span className="text-xl font-semibold text-emerald-700">tCO₂e/yr</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-emerald-600/10 border border-emerald-200 flex items-center justify-center font-extrabold text-emerald-800">
                          {result.rank.tier}
                        </div>
                        <div className="text-sm text-slate-700">
                          1인 기준: <span className="font-semibold">{format(result.perPerson)} tCO₂e/인·년</span>
                          <div className="text-emerald-800 font-bold">등급: {result.rank.label}</div>
                          <div className="text-xs text-slate-500">※ 데모 밴드 (S≤3, A≤5, B≤7, C≤9, D&gt;9)</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Button variant="outline" onClick={() => setCalculated(false)}>다시 선택하기</Button>
                    </div>
                  </div>

                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie dataKey="value" data={result.breakdown} innerRadius={60} outerRadius={92} paddingAngle={2}>
                          {result.breakdown.map((_, idx) => (
                            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val) => `${format(Number(val))} tCO₂e`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-100">
                    <div className="text-sm text-emerald-800">오늘 내가 걸은 길</div>
                    <div className="mt-1 text-lg font-semibold text-emerald-900">
                      오늘 내가 걸은 길 {walkKmToday} km로 자동차 대비 약 {format(avoidedKg)} kg CO₂를 줄였어요! 🚶‍♀️🌿
                    </div>
                    <div className="text-xs text-emerald-800/80 mt-1">가정: 자가용 평균 0.19 kgCO₂/km.</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
