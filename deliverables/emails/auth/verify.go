package main

import("bytes";"fmt";"html/template";"os";"path/filepath";"strings")
func main(){
 files,err:=filepath.Glob("*.html");if err!=nil{panic(err)};count:=0
 for _,file:=range files{
  if strings.Contains(file,"preview")||file=="index.html"{continue}
  raw,err:=os.ReadFile(file);if err!=nil{panic(err)}
  t,err:=template.New(file).Parse(string(raw));if err!=nil{panic(err)}
  var out bytes.Buffer
  err=t.Execute(&out,map[string]string{"ConfirmationURL":"https://example.invalid/verify?token=synthetic&type=invite","Token":"123456"});if err!=nil{panic(err)}
  rendered:=out.String();if strings.Contains(rendered,"{{")||strings.Contains(rendered,"ZgotmplZ"){panic("invalid rendered action in "+file)}
  if file=="reauthentication.html"{if !strings.Contains(rendered,"123456"){panic("missing OTP")}}else{if !strings.Contains(rendered,"https://example.invalid/verify?token=synthetic"){panic("missing confirmation URL")}}
  count++
 }
 if count!=5{panic("expected five templates")};fmt.Println("PASS: all five Go HTML templates parse and render their action URL/OTP with synthetic values.")
}
