import json
import unittest
from analyzer import normalize, token_counts, replay_scenarios, contributors, report
from preflight import estimate_api_request

class FakeEncoding:
    name='test-encoding'
    def encode(self, text):
        return list(text.encode('utf-8'))

class Tests(unittest.TestCase):
    def setUp(self):
        self.data = json.dumps({'title':'Example','messages':[
            {'role':'user','content':'Hello'},
            {'role':'assistant','content':'Hi'},
            {'role':'tool','content':'RESULT'},
            {'role':'user','content':'Next'},
            {'role':'assistant','content':'Done'}
        ]}).encode()
    def test_normalize_simple(self):
        s=normalize(self.data)
        self.assertEqual(len(s['messages']),5)
        self.assertEqual(s['meta']['title'],'Example')
    def test_token_math(self):
        s=normalize(self.data)
        c=token_counts(s,FakeEncoding())
        self.assertEqual(c['visible_body_tokens'],5+2+6+4+4)
        self.assertEqual(c['visible_output_tokens'],6)
        r=replay_scenarios(c)
        self.assertEqual(r['user_turn_only']['modeled_invocations'],2)
        self.assertEqual(r['user_plus_tool_returns']['modeled_invocations'],3)
        self.assertGreater(r['user_turn_only']['modeled_input_tokens'],0)
        big=contributors(c)
        self.assertEqual(big['top_15'][0]['role'],'tool')
        out=report(s,c,r,big,190)
        self.assertEqual(out['reported_work_credits'],190)
    def test_active_branch(self):
        data={'title':'Branched','current_node':'a3','mapping':{
            'a1':{'parent':None,'message':{'author':{'role':'user'},'content':{'parts':['Start']}}},
            'a2':{'parent':'a1','message':{'author':{'role':'assistant'},'content':{'parts':['Other']}}},
            'a3':{'parent':'a1','message':{'author':{'role':'assistant'},'content':{'parts':['Chosen']}}}
        }}
        s=normalize(json.dumps(data).encode())
        self.assertEqual([m['content'] for m in s['messages']],['Start','Chosen'])
    def test_no_guess_branch(self):
        data={'mapping':{'a':{'message':{'content':{'parts':['a']}}}}}
        with self.assertRaisesRegex(ValueError,'current_node'):
            normalize(json.dumps(data).encode())
    def test_bad_json(self):
        with self.assertRaises(json.JSONDecodeError):
            normalize(b'{not json')
    def test_preflight_budget(self):
        e=estimate_api_request([{'role':'user','content':'Hello'}],FakeEncoding(),100,
                               '1.00','5.00','0.001')
        self.assertEqual(e['decision'],'WITHIN_ESTIMATE')
        block=estimate_api_request([{'role':'user','content':'Hello'}],FakeEncoding(),100,
                                   '1.00','5.00','0.00001')
        self.assertEqual(block['decision'],'BLOCK_ESTIMATE_EXCEEDS_BUDGET')

    def test_file_limit(self):
        with self.assertRaisesRegex(ValueError,'25 MB'):
            normalize(b' ' * (25*1024*1024 + 1))

if __name__=='__main__':
    unittest.main()
