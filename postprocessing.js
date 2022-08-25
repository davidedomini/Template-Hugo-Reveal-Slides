import { fdatasync, promises } from 'fs'
import { JSDOM } from 'jsdom'
import temp from 'temp'
import path from 'path'
import toml from 'toml'
import { run } from "@mermaid-js/mermaid-cli"

temp.track() // manage clean of temporary file

const readdir = promises.readdir
const zip = (a, b) => a.map((k, i) => [k, b[i]]);

async function getHtmlIndexes(dirName) {
  const files = await readdir(dirName, { withFileTypes: true });
  let indexesPromises = files.filter(file => file.isDirectory())
    .flatMap(file => getHtmlIndexes(`${dirName}/${file.name}`))
  let indexes = await (await Promise.all(indexesPromises)).flat();
  
  let localIndexes = files
    .filter(file => file.name.includes("index.html"))
    .map(file => `${dirName}/${file.name}`)
  return await localIndexes.concat(indexes)
}

async function getMarmaidFromToml(where) {
  const config = await promises.readFile(where)
  const data = await toml.parse(config.toString())
  return { 
    parseMMDOptions: { 
      backgroundColor: "trasparent", 
      mermaidConfig : data.params.reveal_hugo.mermaid[0] 
    }
  }
}

async function loadPages() {
  const files = await getHtmlIndexes("build")
  const fileLoaded = await Promise.all(files.map(file => JSDOM.fromFile(file)))
  zip(files, fileLoaded).forEach(element => {
    inlineSvgInPage(...element)
  })
}

async function inlineSvgInPage(fileName, page) {
  const mermaidContent = page.window.document.querySelectorAll(".mermaid")
  const updates = Array.from(mermaidContent)
    .filter(element => element.attributes["data-processed"] === undefined)
    .map(async element => {
      let svgContent = await getSvg(element)
      element.innerHTML = svgContent
      element.setAttribute("data-processed", "true")
      element.setAttribute("pre-rendered", "true")
    })
  await Promise.all(updates)
  promises.writeFile(fileName, page.serialize())
}

async function getSvg(element) {
  const mermaidConfig = await getMarmaidFromToml("./config.toml")
  const htmlTemp = await temp.open({prefix: "html-append", suffix: ".md"})
  const svgTemp = await temp.open({prefix: "svg-temp", suffix: ".svg"})
  const svgFilePath = path.parse(svgTemp.path)
  const mermaidContent = "```mermaid\n" + element.innerHTML + "```"
  const svgContent = await promises.writeFile(htmlTemp.path, mermaidContent)
    .then(any => run(htmlTemp.path, svgTemp.path, mermaidConfig ))
    .then(any => promises.readFile(svgFilePath.dir + "/" + svgFilePath.name + "-1.svg"))
  return svgContent.toString()
}

loadPages().then(value => console.log("All pages updated!"))