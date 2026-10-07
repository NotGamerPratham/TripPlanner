import { z } from 'zod';

const fee = z.object({ amount: z.number(), currency: z.string(), status: z.enum(['verified', 'unknown']) });
const activity = z.object({
  id: z.string(), start: z.string(), end: z.string(), title: z.string(), description: z.string(),
  placeId: z.string().optional(), location: z.string(), category: z.string(), weatherFit: z.enum(['outdoor', 'indoor', 'mixed']),
  entryFee: fee, travelMinutesFromPrevious: z.number(), travelCost: z.object({ amount: z.number(), currency: z.string(), status: z.enum(['estimated', 'unknown']) }),
  rainPlanB: z.string().optional()
});
const day = z.object({
  day: z.number(), date: z.string(), theme: z.string(), weather: z.object({ forecast: z.string(), rainRisk: z.number(), source: z.enum(['open-meteo', 'unavailable']) }),
  activities: z.array(activity), food: z.array(z.object({ meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']), dish: z.string(), why: z.string(), estimatedCost: z.object({ amount: z.number(), currency: z.string(), status: z.enum(['verified', 'estimated', 'unknown']) }) })),
  estimatedDailyCost: z.number()
});

export const itinerarySchema = z.object({
  title: z.string(), summary: z.string(), destination: z.string(), currency: z.string(), travelers: z.number(), totalBudget: z.number(), bufferPercent: z.number(),
  stays: z.array(z.object({ id: z.string(), name: z.string(), tier: z.enum(['backpacker', 'mid', 'luxury']), location: z.string(), nightly: z.object({ amount: z.number(), currency: z.string(), status: z.enum(['verified', 'unknown']) }), source: z.enum(['openstreetmap', 'provider']), notes: z.string() })),
  days: z.array(day), transportPlan: z.array(z.string()), moneySavingHacks: z.array(z.string()), packingList: z.array(z.string()), safetyTips: z.array(z.string()),
  emergencyNumbers: z.array(z.object({ label: z.string(), number: z.string(), source: z.string(), status: z.enum(['verified', 'unknown']) })),
  sources: z.array(z.object({ name: z.string(), url: z.string(), usedFor: z.string() }))
});

export const itineraryJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, destination: { type: 'string' }, currency: { type: 'string' }, travelers: { type: 'integer' }, totalBudget: { type: 'number' }, bufferPercent: { type: 'number' },
    stays: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id:{type:'string'}, name:{type:'string'}, tier:{type:'string',enum:['backpacker','mid','luxury']}, location:{type:'string'}, nightly:{type:'object',additionalProperties:false,properties:{amount:{type:'number'},currency:{type:'string'},status:{type:'string',enum:['verified','unknown']}},required:['amount','currency','status']},source:{type:'string',enum:['openstreetmap','provider']},notes:{type:'string'} }, required:['id','name','tier','location','nightly','source','notes'] } },
    days: { type: 'array', items: { type:'object',additionalProperties:false,properties: {
      day:{type:'integer'},date:{type:'string'},theme:{type:'string'},weather:{type:'object',additionalProperties:false,properties:{forecast:{type:'string'},rainRisk:{type:'number'},source:{type:'string',enum:['open-meteo','unavailable']}},required:['forecast','rainRisk','source']},
      activities:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},start:{type:'string'},end:{type:'string'},title:{type:'string'},description:{type:'string'},placeId:{type:'string'},location:{type:'string'},category:{type:'string'},weatherFit:{type:'string',enum:['outdoor','indoor','mixed']},entryFee:{type:'object',additionalProperties:false,properties:{amount:{type:'number'},currency:{type:'string'},status:{type:'string',enum:['verified','unknown']}},required:['amount','currency','status']},travelMinutesFromPrevious:{type:'number'},travelCost:{type:'object',additionalProperties:false,properties:{amount:{type:'number'},currency:{type:'string'},status:{type:'string',enum:['estimated','unknown']}},required:['amount','currency','status']},rainPlanB:{type:'string'}},required:['id','start','end','title','description','location','category','weatherFit','entryFee','travelMinutesFromPrevious','travelCost']}} ,
      food:{type:'array',items:{type:'object',additionalProperties:false,properties:{meal:{type:'string',enum:['breakfast','lunch','dinner','snack']},dish:{type:'string'},why:{type:'string'},estimatedCost:{type:'object',additionalProperties:false,properties:{amount:{type:'number'},currency:{type:'string'},status:{type:'string',enum:['verified','estimated','unknown']}},required:['amount','currency','status']}},required:['meal','dish','why','estimatedCost']}},
      estimatedDailyCost:{type:'number'}
    },required:['day','date','theme','weather','activities','food','estimatedDailyCost'] } },
    transportPlan:{type:'array',items:{type:'string'}}, moneySavingHacks:{type:'array',items:{type:'string'}}, packingList:{type:'array',items:{type:'string'}}, safetyTips:{type:'array',items:{type:'string'}},
    emergencyNumbers:{type:'array',items:{type:'object',additionalProperties:false,properties:{label:{type:'string'},number:{type:'string'},source:{type:'string'},status:{type:'string',enum:['verified','unknown']}},required:['label','number','source','status']}},
    sources:{type:'array',items:{type:'object',additionalProperties:false,properties:{name:{type:'string'},url:{type:'string'},usedFor:{type:'string'}},required:['name','url','usedFor']}}
  }, required:['title','summary','destination','currency','travelers','totalBudget','bufferPercent','stays','days','transportPlan','moneySavingHacks','packingList','safetyTips','emergencyNumbers','sources']
};

export function validateItinerary(input) {
  return itinerarySchema.parse(input);
}
