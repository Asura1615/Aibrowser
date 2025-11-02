import json
from io import StringIO
import sys

with open('./out.txt', 'r') as f:
    res = json.load(f)
    myres = json.dumps(res, indent=2)
    print(myres)
    # captured_string = captured_output.getvalue()
    # print(captured_string)
    # print(json.loads(captured_string))
    # parsed_output = json.loads(last_json)
    # print(parsed_output)
